using HomeBase.API.Models;
using HomeBase.API.Services;
using Microsoft.AspNetCore.Mvc;

namespace HomeBase.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AiController : ControllerBase
{
    private readonly AiService _aiService;
    private readonly DockerService _docker;
    private readonly ComposeFileService _composeFile;
    private readonly IConfiguration _config;
    private readonly ILogger<AiController> _logger;

    public AiController(AiService aiService, DockerService docker, ComposeFileService composeFile,
        IConfiguration config, ILogger<AiController> logger)
    {
        _aiService = aiService;
        _docker = docker;
        _composeFile = composeFile;
        _config = config;
        _logger = logger;
    }

    private string ProjectDir => _config["Paths:ProjectDir"] ?? "/app/project";

    [HttpGet("status")]
    public async Task<IActionResult> GetStatus()
    {
        var config = await _aiService.GetConfigAsync();
        return Ok(new AiStatusResponse(config.Enabled, !string.IsNullOrWhiteSpace(config.ApiKey), config.Model));
    }

    [HttpGet("host-drives")]
    public IActionResult GetHostDrives()
    {
        var drives = new List<object>();
        var hostfsPath = "/hostfs";

        if (!Directory.Exists(hostfsPath))
            return Ok(drives);

        try
        {
            foreach (var dir in Directory.GetDirectories(hostfsPath))
            {
                var name = Path.GetFileName(dir);
                // Only single-letter dirs (drive mounts: c, d, e, etc.)
                if (name.Length == 1 && char.IsLetter(name[0]))
                {
                    var accessible = true;
                    try { Directory.GetDirectories(dir); }
                    catch { accessible = false; }

                    drives.Add(new
                    {
                        name = name.ToUpper() + ":",
                        path = dir.Replace('\\', '/'),
                        accessible
                    });
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to enumerate host drives at /hostfs");
        }

        return Ok(drives.OrderBy(d => ((dynamic)d).name));
    }

    private static readonly HashSet<string> ForbiddenPaths = new(StringComparer.OrdinalIgnoreCase)
    {
        "/proc", "/sys", "/dev"
    };

    [HttpGet("directories")]
    public IActionResult GetDirectories([FromQuery] string? path)
    {
        var basePath = path ?? "/";

        var fullPath = Path.GetFullPath(basePath);

        // Block sensitive system directories
        if (ForbiddenPaths.Any(fp => fullPath.StartsWith(fp, StringComparison.OrdinalIgnoreCase)))
            return BadRequest(new ApiError("FORBIDDEN_PATH", "Cannot browse system directories"));

        if (!Directory.Exists(fullPath))
            return NotFound(new ApiError("NOT_FOUND", "Directory not found"));

        var entries = new List<DirectoryEntry>();
        try
        {
            foreach (var dir in Directory.GetDirectories(fullPath))
            {
                var name = Path.GetFileName(dir);
                if (name.StartsWith('.')) continue; // skip hidden dirs

                // Skip forbidden paths
                var dirPath = dir.Replace('\\', '/');
                if (ForbiddenPaths.Contains(dirPath)) continue;

                var hasSubdirs = false;
                try { hasSubdirs = Directory.GetDirectories(dir).Any(); } catch { }

                var isProject = IsProjectDirectory(dir);
                entries.Add(new DirectoryEntry(name, dirPath, hasSubdirs, isProject));
            }
        }
        catch (UnauthorizedAccessException)
        {
            return StatusCode(403, new ApiError("ACCESS_DENIED", "Cannot access directory"));
        }

        return Ok(entries.OrderByDescending(e => e.IsProject).ThenBy(e => e.Name));
    }

    [HttpPost("analyze")]
    public async Task<IActionResult> Analyze([FromBody] AiAnalysisRequest request)
    {
        var fullPath = Path.GetFullPath(request.ProjectPath);

        // Block sensitive system directories
        if (ForbiddenPaths.Any(fp => fullPath.StartsWith(fp, StringComparison.OrdinalIgnoreCase)))
            return BadRequest(new ApiError("FORBIDDEN_PATH", "Cannot analyze system directories"));

        if (!Directory.Exists(fullPath))
            return NotFound(new ApiError("NOT_FOUND", "Directory not found"));

        try
        {
            var result = await _aiService.AnalyzeProjectAsync(fullPath);
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new ApiError("AI_ERROR", ex.Message));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "AI analysis failed for {Path}", request.ProjectPath);
            return StatusCode(500, new ApiError("AI_ERROR", "AI analysis failed: " + ex.Message));
        }
    }

    [HttpPost("write-dockerfile")]
    public async Task<IActionResult> WriteDockerfile([FromBody] WriteDockerfileRequest request)
    {
        var fullPath = Path.GetFullPath(request.ProjectPath);
        if (ForbiddenPaths.Any(fp => fullPath.StartsWith(fp, StringComparison.OrdinalIgnoreCase)))
            return BadRequest(new ApiError("FORBIDDEN_PATH", "Cannot write to system directories"));

        if (!Directory.Exists(fullPath))
            return NotFound(new ApiError("NOT_FOUND", "Directory not found"));

        var dockerfilePath = Path.Combine(fullPath, "Dockerfile");
        await System.IO.File.WriteAllTextAsync(dockerfilePath, request.Content);
        _logger.LogInformation("Wrote Dockerfile to {Path}", dockerfilePath);

        return Ok(new { ok = true });
    }

    [HttpPost("agent-fix")]
    public async Task<IActionResult> AgentFix([FromBody] AgentFixRequest request)
    {
        var composePath = _composeFile.GetComposeFilePath(request.ServiceSlug);
        if (!System.IO.File.Exists(composePath))
            return NotFound(new ApiError("NO_FILE", "Compose file not found"));

        try
        {
            var ctx = await GatherDeployContextAsync(request.ServiceSlug, composePath);
            var response = await _aiService.AgentFixAsync(ctx, request.PreviousAttempts, request.UserInstruction, request.Language);

            // Apply fix if present
            if (response.Fix != null)
            {
                var backupPath = composePath + ".bak";
                try { System.IO.File.Copy(composePath, backupPath, true); } catch { }

                if (response.Fix.Type == "compose" && !string.IsNullOrWhiteSpace(response.Fix.Content))
                {
                    await System.IO.File.WriteAllTextAsync(composePath, response.Fix.Content);
                    _logger.LogInformation("Agent fix applied compose to {Path}", composePath);
                }
                else if (response.Fix.Type == "dockerfile" && !string.IsNullOrWhiteSpace(response.Fix.Content))
                {
                    var dfPath = FindDockerfilePath(composePath);
                    if (dfPath != null)
                    {
                        await System.IO.File.WriteAllTextAsync(dfPath, response.Fix.Content);
                        _logger.LogInformation("Agent fix applied Dockerfile to {Path}", dfPath);
                    }
                }
                else if (response.Fix.Type == "infra" && !string.IsNullOrWhiteSpace(response.Fix.Content))
                {
                    var cmd = response.Fix.Content.Trim();
                    _logger.LogInformation("Agent fix running infra command: {Cmd}", cmd);
                    var (cmdOk, cmdOut) = _docker.RunShell(cmd, 30000);
                    var cmdResult = cmdOk ? "Command executed successfully" : $"Command failed: {cmdOut}";
                    response = response with { Reasoning = $"{response.Reasoning}\n\n[Infra Result] {cmdResult}" };
                }
            }

            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Agent fix failed for {Slug}", request.ServiceSlug);
            return StatusCode(500, new ApiError("AI_ERROR", $"Agent fix failed: {ex.Message}"));
        }
    }

    [HttpPost("detect-url-path")]
    public async Task<IActionResult> DetectUrlPath([FromBody] Dictionary<string, string> body)
    {
        var slug = body.TryGetValue("serviceSlug", out var s) ? s : null;
        if (string.IsNullOrWhiteSpace(slug))
            return BadRequest(new ApiError("MISSING_SLUG", "serviceSlug required"));

        var composePath = _composeFile.GetComposeFilePath(slug);
        if (!System.IO.File.Exists(composePath))
            return NotFound(new ApiError("NO_FILE", "Compose file not found"));

        try
        {
            var ctx = await GatherDeployContextAsync(slug, composePath);
            var urlPath = await _aiService.DetectUrlPathAsync(ctx);
            return Ok(new { urlPath });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new ApiError("AI_ERROR", ex.Message));
        }
    }

    private async Task<DeployContext> GatherDeployContextAsync(string serviceSlug, string composePath)
    {
        var composeYaml = await System.IO.File.ReadAllTextAsync(composePath);
        var serviceDir = Path.GetDirectoryName(composePath)!;

        // Container name from compose
        var containerName = serviceSlug;
        foreach (var line in composeYaml.Split('\n'))
        {
            var trimmed = line.Trim();
            if (trimmed.StartsWith("container_name:"))
            {
                containerName = trimmed.Split(':')[1].Trim().Trim('"', '\'');
                break;
            }
        }

        // Container logs (last 100 lines, current + previous)
        var logs = "";
        try
        {
            var (logOk, logOut) = _docker.RunShell($"docker logs {containerName} --tail 100 2>&1", 10000);
            logs = logOut ?? "";
            if (string.IsNullOrWhiteSpace(logs) || logs.Trim().Length < 20)
            {
                var (prevOk, prevOut) = _docker.RunShell($"docker logs {containerName} --tail 100 --previous 2>&1", 10000);
                if (prevOk && !string.IsNullOrWhiteSpace(prevOut) && !prevOut.Contains("No such container") && !prevOut.Contains("no such"))
                    logs = string.IsNullOrWhiteSpace(logs) ? $"[Previous container logs]\n{prevOut}" : $"{logs}\n\n[Previous container logs]\n{prevOut}";
            }
            if (string.IsNullOrWhiteSpace(logs)) logs = "No logs available";
        }
        catch { logs = "Failed to fetch logs"; }

        // Container state
        string? containerState = null;
        try
        {
            var (inspOk, inspOut) = _docker.RunShell($"docker inspect {containerName} --format '{{{{.State.Status}}}} ExitCode:{{{{.State.ExitCode}}}} Error:{{{{.State.Error}}}} OOMKilled:{{{{.State.OOMKilled}}}}'", 5000);
            if (inspOk && !string.IsNullOrWhiteSpace(inspOut)) containerState = inspOut.Trim();
        }
        catch { }

        // Dockerfile
        string? dockerfileContent = null;
        var buildCtx = ExtractBuildContext(composeYaml);
        if (!string.IsNullOrWhiteSpace(buildCtx))
        {
            var dfPath = Path.IsPathRooted(buildCtx)
                ? Path.Combine(buildCtx, "Dockerfile")
                : Path.Combine(serviceDir, buildCtx, "Dockerfile");
            dfPath = Path.GetFullPath(dfPath);
            if (System.IO.File.Exists(dfPath))
                try { dockerfileContent = await System.IO.File.ReadAllTextAsync(dfPath); } catch { }
        }

        // Project files
        var projectFiles = ReadProjectContext(buildCtx ?? "", serviceDir);

        // Directory listing
        string? dirListing = null;
        if (!string.IsNullOrWhiteSpace(buildCtx))
        {
            var projDir = Path.IsPathRooted(buildCtx) ? buildCtx : Path.Combine(serviceDir, buildCtx);
            projDir = Path.GetFullPath(projDir);
            if (Directory.Exists(projDir))
            {
                try
                {
                    var entries = Directory.GetFileSystemEntries(projDir)
                        .Select(Path.GetFileName)
                        .Where(n => !string.IsNullOrEmpty(n) && !n!.StartsWith('.'))
                        .Take(30);
                    dirListing = string.Join("\n", entries);
                }
                catch { }
            }
        }

        // Network info
        string? networkInfo = null;
        try
        {
            var (netOk, netOut) = _docker.RunShell("docker network inspect homebase 2>&1 | head -60", 5000);
            if (netOk && !string.IsNullOrWhiteSpace(netOut)) networkInfo = netOut;
        }
        catch { }

        // Running containers
        string? runningContainers = null;
        try
        {
            var (psOk, psOut) = _docker.RunShell("docker ps --format '{{.Names}} {{.Status}} {{.Ports}}'", 5000);
            if (psOk && !string.IsNullOrWhiteSpace(psOut)) runningContainers = psOut;
        }
        catch { }

        return new DeployContext(containerName, composeYaml, dockerfileContent, logs, containerState, projectFiles, dirListing, networkInfo, runningContainers);
    }

    private static string ExtractBuildContext(string composeYaml)
    {
        foreach (var line in composeYaml.Split('\n'))
        {
            var trimmed = line.Trim();
            if (trimmed.StartsWith("build:"))
                return trimmed.Split(':', 2).Last().Trim().Trim('"', '\'');
        }
        return "";
    }

    private string? FindDockerfilePath(string composePath)
    {
        var composeYaml = System.IO.File.ReadAllText(composePath);
        var buildCtx = ExtractBuildContext(composeYaml);
        if (string.IsNullOrWhiteSpace(buildCtx)) return null;
        var serviceDir = Path.GetDirectoryName(composePath)!;
        var dfPath = Path.IsPathRooted(buildCtx)
            ? Path.Combine(buildCtx, "Dockerfile")
            : Path.Combine(serviceDir, buildCtx, "Dockerfile");
        var fullPath = Path.GetFullPath(dfPath);
        return Directory.Exists(Path.GetDirectoryName(fullPath)) ? fullPath : null;
    }

    [HttpPost("fix-and-redeploy")]
    public async Task<IActionResult> FixAndRedeploy([FromBody] FixRedeployRequest request)
    {
        var composePath = _composeFile.GetComposeFilePath(request.ServiceSlug);
        if (!System.IO.File.Exists(composePath))
            return NotFound(new ApiError("NO_FILE", "Compose file not found"));

        // Backup compose before AI modifies it (for rollback)
        var backupPath = composePath + ".bak";
        try { System.IO.File.Copy(composePath, backupPath, true); } catch { }

        // Write the fixed YAML only if provided
        if (!string.IsNullOrWhiteSpace(request.FixedYaml))
        {
            await System.IO.File.WriteAllTextAsync(composePath, request.FixedYaml);
            _logger.LogInformation("AI fix applied to {Path}", composePath);
        }

        // Redeploy — only recreate the service itself, not dependencies
        var serviceDir = Path.GetDirectoryName(composePath)!;
        var (ok, err) = _docker.RunShell($"cd \"{serviceDir}\" && docker compose up -d --build --force-recreate --no-deps", 300000);

        // If deploy failed, restore backup
        if (!ok && System.IO.File.Exists(backupPath))
        {
            try
            {
                System.IO.File.Copy(backupPath, composePath, true);
                _logger.LogWarning("AI fix failed, restored backup compose for {Slug}", request.ServiceSlug);
            }
            catch { }
        }

        return Ok(new { ok, error = err });
    }


    /// Read key project files (requirements.txt, package.json, etc.) for AI context
    private static string ReadProjectContext(string buildCtx, string serviceDir)
    {
        if (string.IsNullOrWhiteSpace(buildCtx)) return "";

        var projectDir = Path.IsPathRooted(buildCtx)
            ? buildCtx
            : Path.Combine(serviceDir, buildCtx);
        projectDir = Path.GetFullPath(projectDir);

        if (!Directory.Exists(projectDir)) return "";

        var context = new System.Text.StringBuilder();
        // Key dependency/config files to read
        string[] files = { "requirements.txt", "package.json", "go.mod", "Cargo.toml",
            "Gemfile", "composer.json", "pom.xml", "build.gradle",
            "appsettings.json", "appsettings.Docker.json", ".env" };

        foreach (var file in files)
        {
            var filePath = Path.Combine(projectDir, file);
            if (System.IO.File.Exists(filePath))
            {
                try
                {
                    var content = System.IO.File.ReadAllText(filePath);
                    if (content.Length > 3000) content = content[..3000] + "\n... (truncated)";
                    context.AppendLine($"\n[{file}]\n{content}");
                }
                catch { }
            }
        }

        // Also list directory contents for structure understanding
        try
        {
            var entries = Directory.GetFileSystemEntries(projectDir)
                .Select(Path.GetFileName)
                .Where(n => !string.IsNullOrEmpty(n) && !n.StartsWith('.'))
                .Take(30);
            context.AppendLine($"\n[Directory listing]\n{string.Join("\n", entries)}");
        }
        catch { }

        return context.ToString();
    }

    private static bool IsProjectDirectory(string dirPath)
    {
        string[] markers = {
            "package.json", "requirements.txt", "Pipfile", "pyproject.toml",
            "go.mod", "Cargo.toml", "pom.xml", "build.gradle",
            "Dockerfile", "docker-compose.yml", "docker-compose.yaml"
        };

        foreach (var marker in markers)
        {
            if (System.IO.File.Exists(Path.Combine(dirPath, marker)))
                return true;
        }

        // Check for *.csproj
        try
        {
            if (Directory.GetFiles(dirPath, "*.csproj").Length > 0)
                return true;
        }
        catch { }

        return false;
    }
}
