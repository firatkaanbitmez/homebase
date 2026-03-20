using HomeBase.API.Data;
using HomeBase.API.Models;
using HomeBase.API.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Diagnostics;
using System.Text;

namespace HomeBase.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class OnboardingController : ControllerBase
{
    private readonly ComposeFileService _composeFile;
    private readonly ServiceManagementService _svcMgmt;
    private readonly SettingsService _settings;
    private readonly FirewallService _firewall;
    private readonly DockerHubService _dockerHub;
    private readonly DockerService _docker;
    private readonly IConfiguration _config;
    private readonly ILogger<OnboardingController> _logger;

    public OnboardingController(
        ComposeFileService composeFile,
        ServiceManagementService svcMgmt,
        SettingsService settings,
        FirewallService firewall,
        DockerHubService dockerHub,
        DockerService docker,
        IConfiguration config,
        ILogger<OnboardingController> logger)
    {
        _composeFile = composeFile;
        _svcMgmt = svcMgmt;
        _settings = settings;
        _firewall = firewall;
        _dockerHub = dockerHub;
        _docker = docker;
        _config = config;
        _logger = logger;
    }

    private string ProjectDir => _config["Paths:ProjectDir"] ?? "/app/project";

    [HttpGet("search")]
    public async Task<IActionResult> SearchDockerHub([FromQuery] string q, [FromQuery] int limit = 25)
    {
        if (string.IsNullOrWhiteSpace(q)) return Ok(Array.Empty<object>());
        var results = await _dockerHub.SearchAsync(q, limit);
        return Ok(results);
    }

    [HttpGet("catalog")]
    public IActionResult GetCatalog()
    {
        var items = ServiceCatalog.GetAll().Select(e => new CatalogItemResponse(
            e.Name, e.Description, e.Image, e.Category,
            e.DefaultPorts, e.DefaultVolumes, e.DefaultEnv
        ));
        return Ok(items);
    }

    [HttpGet("catalog/{name}")]
    public IActionResult GetCatalogItem(string name)
    {
        var entry = ServiceCatalog.GetByName(name);
        if (entry == null) return NotFound();
        return Ok(new CatalogItemResponse(
            entry.Name, entry.Description, entry.Image, entry.Category,
            entry.DefaultPorts, entry.DefaultVolumes, entry.DefaultEnv
        ));
    }

    [HttpPost("preview")]
    public IActionResult Preview([FromBody] PreviewRequest request)
    {
        var composeName = request.ComposeName ?? request.Name.ToLower().Replace(" ", "-");
        var def = BuildDefinition(request.Name, request.Image, composeName,
            request.Ports, request.EnvVars, request.Volumes, request.BuildContext,
            request.DependsOn, request.Environment);

        var yaml = BuildYamlPreview(def);
        var envContent = BuildEnvPreview(request.EnvVars);

        return Ok(new PreviewResponse(yaml, envContent));
    }

    [HttpPost("deploy")]
    public async Task<IActionResult> Deploy([FromBody] DeployRequest request)
    {
        try
        {
            var composeName = request.ComposeName ?? request.Name.ToLower().Replace(" ", "-")
                .Replace("--", "-").Trim('-');

            // 1. Generate unique slug
            var slug = _composeFile.GenerateUniqueSlug(composeName);

            // 2. Check if container name already in use by Docker
            var (ctrCheckOk, ctrCheckOut) = _docker.RunShell($"docker inspect -f '{{{{.State.Status}}}}' {slug}", 5000);
            if (ctrCheckOk && !string.IsNullOrWhiteSpace(ctrCheckOut))
                return Ok(new DeployResponse(false, null, $"'{slug}' adında bir container zaten çalışıyor. Farklı bir isim seçin."));

            // 3. Parse and validate all ports
            var parsedPorts = new Dictionary<string, (int Host, int Container)>();
            if (request.Ports != null)
            {
                foreach (var (portVar, portVal) in request.Ports)
                {
                    int hostPort, containerPort;
                    if (portVal.Contains(':'))
                    {
                        var parts = portVal.Split(':');
                        if (!int.TryParse(parts[0], out hostPort) || !int.TryParse(parts[1], out containerPort))
                            return Ok(new DeployResponse(false, null, $"'{portVal}' gecerli bir port degil"));
                    }
                    else
                    {
                        if (!int.TryParse(portVal, out hostPort))
                            return Ok(new DeployResponse(false, null, $"'{portVal}' gecerli bir port degil"));
                        containerPort = hostPort;
                    }

                    var (valid, error) = await _settings.ValidateNewServicePortAsync(hostPort, request.Name);
                    if (!valid)
                        return Ok(new DeployResponse(false, null, error));

                    parsedPorts[portVar] = (hostPort, containerPort);
                }
            }

            // 4. Build compose definition
            var def = BuildDefinition(request.Name, request.Image, composeName,
                request.Ports, request.EnvVars, request.Volumes, request.BuildContext,
                request.DependsOn, request.Environment);

            // Auto-detect postgres dependency
            if (def.DependsOn.Count == 0)
            {
                bool needsDb = false;
                if (request.EnvVars != null)
                    needsDb = request.EnvVars.Any(e =>
                        e.Key.Contains("DATABASE", StringComparison.OrdinalIgnoreCase) ||
                        e.Key.Contains("DB_", StringComparison.OrdinalIgnoreCase) ||
                        e.Key.Contains("POSTGRES", StringComparison.OrdinalIgnoreCase) ||
                        e.Key.Contains("ConnectionString", StringComparison.OrdinalIgnoreCase) ||
                        (e.Value != null && e.Value.Contains("postgres", StringComparison.OrdinalIgnoreCase)));
                if (request.Environment != null && !needsDb)
                    needsDb = request.Environment.Any(e =>
                        e.Key.Contains("DATABASE", StringComparison.OrdinalIgnoreCase) ||
                        e.Key.Contains("DB_", StringComparison.OrdinalIgnoreCase) ||
                        e.Key.Contains("POSTGRES", StringComparison.OrdinalIgnoreCase) ||
                        (e.Value != null && e.Value.Contains("postgres", StringComparison.OrdinalIgnoreCase)));

                if (!needsDb && !string.IsNullOrEmpty(request.BuildContext))
                {
                    var appSettingsPath = Path.Combine(ProjectDir, request.BuildContext, "appsettings.json");
                    if (System.IO.File.Exists(appSettingsPath))
                    {
                        var appSettings = await System.IO.File.ReadAllTextAsync(appSettingsPath);
                        needsDb = appSettings.Contains("postgres", StringComparison.OrdinalIgnoreCase) ||
                                  appSettings.Contains("Npgsql", StringComparison.OrdinalIgnoreCase);
                    }
                }

                if (needsDb)
                {
                    def.DependsOn.Add("postgres");
                    _logger.LogInformation("Auto-detected postgres dependency for {Service}", composeName);
                }
            }

            // 5. Add port variables to compose definition
            foreach (var (portVar, (hostPort, containerPort)) in parsedPorts)
            {
                def.Ports.Add($"${{{portVar}:-{hostPort}}}:{containerPort}");
            }

            // Use slug as container name
            def.ContainerName = slug;

            // 6. Create Service DB record FIRST (to get Id)
            var svc = new Service
            {
                Name = request.Name,
                Description = request.Description ?? $"Deployed from {request.Image ?? request.BuildContext}",
                Icon = $"/icons/{composeName}.png",
                Color = ServiceManagementService_GenerateColor(composeName),
                ContainerName = slug,
                ServiceSlug = slug,
                ComposeFilePath = _composeFile.GetRelativeComposeFilePath(slug),
                ComposeName = composeName,
                Image = request.Image,
                BuildContext = request.BuildContext,
                IsAutoDiscovered = false,
                IsEnabled = true,
                SortOrder = 999,
            };
            if (!string.IsNullOrEmpty(request.Category))
            {
                // Try to find category by name
                // We don't have direct DB access here; set it after creation if needed
            }
            svc = await _svcMgmt.CreateAsync(svc);

            // 7. Create settings records (with ServiceId FK)
            var allVars = new Dictionary<string, string>();
            foreach (var (k, (h, _)) in parsedPorts) allVars[k] = h.ToString();
            if (request.EnvVars != null)
                foreach (var (k, v) in request.EnvVars) allVars[k] = v;

            if (allVars.Count > 0)
            {
                var portVarNames = request.Ports?.Keys.ToList() ?? new List<string>();
                await _settings.CreateSettingsForServiceAsync(svc.Id, request.Name, allVars, portVarNames);
            }

            // 8. Merge all env vars into compose definition's environment section
            foreach (var (k, v) in allVars)
            {
                if (!def.Environment.ContainsKey(k))
                    def.Environment[k] = v;
            }

            // 9. Write per-service docker-compose.yml
            await _composeFile.WriteServiceComposeAsync(svc, def);

            // 10. Start the service via per-service compose
            var composePath = _composeFile.GetComposeFilePath(slug);
            var (startOk, startErr) = _docker.RunShell($"docker compose -f \"{composePath}\" up -d", 120000);
            if (!startOk)
            {
                _logger.LogError("Failed to start service: {Service} — {Error}", slug, startErr);
                foreach (var (_, (hp, _)) in parsedPorts)
                    try { await _firewall.ClosePortIfUnusedAsync(hp, "TCP"); } catch { }
                return Ok(new DeployResponse(false, slug, $"Service added but failed to start: {startErr}"));
            }

            // 11. Verify container is running
            for (int i = 0; i < 5; i++)
            {
                await Task.Delay(2000);
                var (checkOk, checkOut) = _docker.RunShell($"docker inspect -f '{{{{.State.Status}}}}' {slug}", 5000);
                if (checkOk && checkOut?.Trim() == "running")
                {
                    _logger.LogInformation("Deployed and verified service: {Service}", slug);

                    // Open firewall ports
                    foreach (var (_, (hostPort, _)) in parsedPorts)
                    {
                        try { await _firewall.OpenPortAsync(hostPort, $"SVC-{hostPort}", "TCP", request.Name); }
                        catch (Exception ex) { _logger.LogWarning(ex, "Failed to open firewall port {Port}", hostPort); }
                    }

                    return Ok(new DeployResponse(true, slug, null));
                }
                if (checkOk && checkOut?.Trim() == "exited")
                {
                    foreach (var (_, (hp, _)) in parsedPorts)
                        try { await _firewall.ClosePortIfUnusedAsync(hp, "TCP"); } catch { }
                    var (_, logOut) = _docker.RunShell($"docker logs --tail 10 {slug}", 5000);
                    return Ok(new DeployResponse(false, slug,
                        $"Container started but exited immediately. Logs: {logOut?.Trim()}"));
                }
            }

            // 12. Open firewall ports
            foreach (var (_, (hostPort, _)) in parsedPorts)
            {
                try { await _firewall.OpenPortAsync(hostPort, $"SVC-{hostPort}", "TCP", request.Name); }
                catch (Exception ex) { _logger.LogWarning(ex, "Failed to open firewall port {Port}", hostPort); }
            }

            _logger.LogInformation("Deployed service: {Service} (status unverified)", slug);
            return Ok(new DeployResponse(true, slug, null));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Deploy failed for {Name}", request.Name);
            return Ok(new DeployResponse(false, null, ex.Message));
        }
    }

    private static ComposeServiceDefinition BuildDefinition(string name, string? image, string composeName,
        Dictionary<string, string>? ports, Dictionary<string, string>? envVars, List<string>? volumes,
        string? buildContext = null, List<string>? dependsOn = null, Dictionary<string, string>? environment = null)
    {
        var def = new ComposeServiceDefinition
        {
            ComposeName = composeName,
            ContainerName = composeName,
            Image = image,
            RestartPolicy = "unless-stopped",
        };

        if (!string.IsNullOrEmpty(buildContext))
            def.BuildContext = buildContext;

        if (volumes != null)
            def.Volumes = volumes;

        if (dependsOn != null)
            def.DependsOn = dependsOn;

        if (environment != null)
            def.Environment = environment;

        return def;
    }

    private static string BuildYamlPreview(ComposeServiceDefinition def)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"  {def.ComposeName}:");
        if (!string.IsNullOrEmpty(def.BuildContext))
            sb.AppendLine($"    build: {def.BuildContext}");
        else if (!string.IsNullOrEmpty(def.Image))
            sb.AppendLine($"    image: {def.Image}");
        sb.AppendLine($"    container_name: {def.ContainerName}");
        sb.AppendLine($"    restart: {def.RestartPolicy}");
        if (def.Ports.Count > 0)
        {
            sb.AppendLine("    ports:");
            foreach (var p in def.Ports) sb.AppendLine($"      - \"{p}\"");
        }
        if (def.EnvFiles.Count > 0)
            sb.AppendLine($"    env_file: {def.EnvFiles[0]}");
        if (def.Volumes.Count > 0)
        {
            sb.AppendLine("    volumes:");
            foreach (var v in def.Volumes) sb.AppendLine($"      - {v}");
        }
        if (def.Environment.Count > 0)
        {
            sb.AppendLine("    environment:");
            foreach (var (k, v) in def.Environment) sb.AppendLine($"      {k}: \"{v}\"");
        }
        if (def.DependsOn.Count > 0)
        {
            sb.AppendLine("    depends_on:");
            foreach (var d in def.DependsOn) sb.AppendLine($"      - {d}");
        }
        return sb.ToString();
    }

    private static string? BuildEnvPreview(Dictionary<string, string>? envVars)
    {
        if (envVars == null || envVars.Count == 0) return null;
        var sb = new StringBuilder();
        foreach (var (key, val) in envVars)
            sb.AppendLine($"{key}={val}");
        return sb.ToString();
    }

    private static string ServiceManagementService_GenerateColor(string name)
    {
        var hash = name.GetHashCode();
        var colors = new[] { "#e74c3c", "#3498db", "#10b981", "#f59e0b", "#8b5cf6", "#06b6d4", "#f97316", "#ec4899", "#6366f1", "#14b8a6" };
        return colors[Math.Abs(hash) % colors.Length];
    }
}
