using HomeBase.API.Models;
using HomeBase.API.Services;
using Microsoft.AspNetCore.Mvc;

namespace HomeBase.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AiController : ControllerBase
{
    private readonly AiService _aiService;
    private readonly IConfiguration _config;
    private readonly ILogger<AiController> _logger;

    public AiController(AiService aiService, IConfiguration config, ILogger<AiController> logger)
    {
        _aiService = aiService;
        _config = config;
        _logger = logger;
    }

    private string ProjectDir => _config["Paths:ProjectDir"] ?? "/app/project";

    [HttpGet("status")]
    public async Task<IActionResult> GetStatus()
    {
        var (enabled, apiKey, model) = await _aiService.GetConfigAsync();
        return Ok(new AiStatusResponse(enabled, !string.IsNullOrWhiteSpace(apiKey), model));
    }

    [HttpGet("directories")]
    public IActionResult GetDirectories([FromQuery] string? path)
    {
        var basePath = path ?? ProjectDir;

        // Security: only allow listing under ProjectDir
        var fullPath = Path.GetFullPath(basePath);
        var allowedRoot = Path.GetFullPath(ProjectDir);
        if (!fullPath.StartsWith(allowedRoot, StringComparison.OrdinalIgnoreCase))
            return BadRequest(new ApiError("INVALID_PATH", "Path traversal not allowed"));

        if (!Directory.Exists(fullPath))
            return NotFound(new ApiError("NOT_FOUND", "Directory not found"));

        var entries = new List<DirectoryEntry>();
        try
        {
            foreach (var dir in Directory.GetDirectories(fullPath))
            {
                var name = Path.GetFileName(dir);
                if (name.StartsWith('.')) continue; // skip hidden dirs

                var hasSubdirs = false;
                try { hasSubdirs = Directory.GetDirectories(dir).Any(); } catch { }

                var isProject = IsProjectDirectory(dir);
                entries.Add(new DirectoryEntry(name, dir.Replace('\\', '/'), hasSubdirs, isProject));
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
        // Security: only allow paths under ProjectDir
        var fullPath = Path.GetFullPath(request.ProjectPath);
        var allowedRoot = Path.GetFullPath(ProjectDir);
        if (!fullPath.StartsWith(allowedRoot, StringComparison.OrdinalIgnoreCase))
            return BadRequest(new ApiError("INVALID_PATH", "Path traversal not allowed"));

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
        var allowedRoot = Path.GetFullPath(ProjectDir);
        if (!fullPath.StartsWith(allowedRoot, StringComparison.OrdinalIgnoreCase))
            return BadRequest(new ApiError("INVALID_PATH", "Path traversal not allowed"));

        if (!Directory.Exists(fullPath))
            return NotFound(new ApiError("NOT_FOUND", "Directory not found"));

        var dockerfilePath = Path.Combine(fullPath, "Dockerfile");
        await System.IO.File.WriteAllTextAsync(dockerfilePath, request.Content);
        _logger.LogInformation("Wrote Dockerfile to {Path}", dockerfilePath);

        return Ok(new { ok = true });
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
