using HomeBase.API.Data;
using HomeBase.API.Hubs;
using HomeBase.API.Models;
using HomeBase.API.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
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
    private readonly PortAccessService _portAccess;
    private readonly DockerHubService _dockerHub;
    private readonly DockerService _docker;
    private readonly IConfiguration _config;
    private readonly ILogger<OnboardingController> _logger;
    private readonly IHubContext<DashboardHub> _hub;

    public OnboardingController(
        ComposeFileService composeFile,
        ServiceManagementService svcMgmt,
        SettingsService settings,
        PortAccessService portAccess,
        DockerHubService dockerHub,
        DockerService docker,
        IConfiguration config,
        ILogger<OnboardingController> logger,
        IHubContext<DashboardHub> hub)
    {
        _composeFile = composeFile;
        _svcMgmt = svcMgmt;
        _settings = settings;
        _portAccess = portAccess;
        _dockerHub = dockerHub;
        _docker = docker;
        _config = config;
        _logger = logger;
        _hub = hub;
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
    public async Task<IActionResult> GetCatalog()
    {
        var entries = ServiceCatalog.GetAll();
        var enriched = await _dockerHub.EnrichCatalogAsync(entries);
        return Ok(enriched.Select(e => new CatalogItemResponse(
            e.Name, e.Description, e.Image, e.Category,
            e.DefaultPorts, e.DefaultVolumes, e.DefaultEnv,
            e.StarCount, e.PullCount, e.IsOfficial, e.LogoUrl
        )));
    }

    [HttpGet("catalog/{name}")]
    public async Task<IActionResult> GetCatalogItem(string name)
    {
        var entry = ServiceCatalog.GetByName(name);
        if (entry == null) return NotFound();
        var info = await _dockerHub.GetRepoInfoAsync(entry.Image);
        return Ok(new CatalogItemResponse(
            entry.Name, info?.Description ?? entry.Description, entry.Image, entry.Category,
            entry.DefaultPorts, entry.DefaultVolumes, entry.DefaultEnv,
            info?.StarCount ?? 0, info?.PullCount ?? 0, info?.IsOfficial ?? false, info?.LogoUrl
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
                return Ok(new DeployResponse(false, null, $"A container named '{slug}' is already running. Choose a different name."));

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
                            return Ok(new DeployResponse(false, null, $"'{portVal}' is not a valid port"));
                    }
                    else
                    {
                        if (!int.TryParse(portVal, out hostPort))
                            return Ok(new DeployResponse(false, null, $"'{portVal}' is not a valid port"));
                        containerPort = hostPort;
                    }

                    var (valid, error) = await _settings.ValidateNewServicePortAsync(hostPort, request.Name);
                    if (!valid)
                        return Ok(new DeployResponse(false, null, error));

                    parsedPorts[portVar] = (hostPort, containerPort);
                }
            }

            // 3b. Auto-assign port if none specified
            if (parsedPorts.Count == 0 && !string.IsNullOrEmpty(request.Image))
            {
                var containerPort = DetectContainerPort(request.Image);
                var hostPort = await FindAvailablePortAsync(containerPort, request.Name);
                var varName = composeName.ToUpper().Replace("-", "_") + "_PORT";
                parsedPorts[varName] = (hostPort, containerPort);
                _logger.LogInformation("Auto-assigned port {Host}:{Container} for {Service}", hostPort, containerPort, composeName);
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
                def.Ports.Add($"127.0.0.1:${{{portVar}:-{hostPort}}}:{containerPort}");
            }

            // Use slug as container name
            def.ContainerName = slug;

            // 6. Create Service DB record FIRST (to get Id)
            var svc = new Service
            {
                Name = request.Name,
                Description = request.Description ?? $"Deployed from {request.Image ?? request.BuildContext}",
                Icon = $"/icons/{composeName}.png",
                Color = ServiceManagementService.GenerateColor(composeName),
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

            // 10. Register port access rules immediately
            foreach (var (_, (hostPort, _)) in parsedPorts)
            {
                try { await _portAccess.OpenPortAsync(hostPort, $"SVC-{hostPort}", "TCP", request.Name); }
                catch (Exception ex) { _logger.LogWarning(ex, "Failed to register port access rule {Port}", hostPort); }
            }

            // 11. Start the service in the background (image pull + compose up)
            var composePath = _composeFile.GetComposeFilePath(slug);
            var capturedSlug = slug;
            var capturedSvcId = svc.Id;
            svc.DeployStatus = "deploying";
            using (var deployScope = HttpContext.RequestServices.CreateScope())
            {
                var deployDb = deployScope.ServiceProvider.GetRequiredService<AppDbContext>();
                var deploySvc = await deployDb.Services.FindAsync(capturedSvcId);
                if (deploySvc != null) { deploySvc.DeployStatus = "deploying"; await deployDb.SaveChangesAsync(); }
            }
            var scopeFactory = HttpContext.RequestServices.GetRequiredService<IServiceScopeFactory>();
            var hubRef = _hub;
            _ = Task.Run(async () =>
            {
                try { await hubRef.Clients.All.SendAsync("DeployProgress", new { slug = capturedSlug, status = "deploying", message = "Pulling image and starting container..." }); } catch { }

                var (ok, err) = _docker.RunShell($"docker compose -f \"{composePath}\" up -d", 300000);
                try
                {
                    using var bgScope = scopeFactory.CreateScope();
                    var bgDb = bgScope.ServiceProvider.GetRequiredService<AppDbContext>();
                    var bgSvc = await bgDb.Services.FindAsync(capturedSvcId);
                    if (bgSvc != null)
                    {
                        bgSvc.DeployStatus = ok ? null : "failed";
                        await bgDb.SaveChangesAsync();
                    }
                }
                catch (Exception ex) { _logger.LogError(ex, "Failed to update deploy status for {Service}", capturedSlug); }

                if (!ok)
                {
                    _logger.LogError("Background deploy failed for {Service}: {Error}", capturedSlug, err);
                    try { await hubRef.Clients.All.SendAsync("DeployProgress", new { slug = capturedSlug, status = "failed", message = err ?? "Deploy failed" }); } catch { }
                }
                else
                {
                    _logger.LogInformation("Background deploy completed for {Service}", capturedSlug);
                    try
                    {
                        await hubRef.Clients.All.SendAsync("DeployProgress", new { slug = capturedSlug, status = "ready", message = "Service deployed successfully" });
                        await _docker.NotifyCacheRefreshAsync();
                    }
                    catch { }
                }
            });

            _logger.LogInformation("Deploy started in background for {Service}", slug);
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

    /// Detect common container port for known Docker images
    private static int DetectContainerPort(string image)
    {
        var known = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
        {
            ["stirling-pdf"] = 8080, ["s-pdf"] = 8080,
            ["nginx"] = 80, ["httpd"] = 80, ["caddy"] = 80,
            ["traefik"] = 80, ["haproxy"] = 80,
            ["grafana"] = 3000, ["metabase"] = 3000, ["gitea"] = 3000,
            ["prometheus"] = 9090,
            ["portainer"] = 9000, ["sonarqube"] = 9000,
            ["filebrowser"] = 80, ["nextcloud"] = 80, ["wordpress"] = 80,
            ["vaultwarden"] = 80, ["ghost"] = 2368,
            ["code-server"] = 8080, ["jenkins"] = 8080, ["nocodb"] = 8080,
            ["adminer"] = 8080, ["dozzle"] = 8080, ["open-webui"] = 8080,
            ["jellyfin"] = 8096, ["plex"] = 32400,
            ["minio"] = 9000, ["mongo-express"] = 8081, ["redis-commander"] = 8081,
            ["uptime-kuma"] = 3001, ["n8n"] = 5678,
            ["changedetection"] = 5000,
            ["it-tools"] = 80, ["cyberchef"] = 80, ["phpmyadmin"] = 80,
            ["glances"] = 61208, ["homer"] = 8080, ["heimdall"] = 80,
            ["homarr"] = 7575, ["dashy"] = 8080,
            ["pihole"] = 80, ["adguard"] = 3000,
            ["syncthing"] = 8384, ["duplicati"] = 8200,
            ["freshrss"] = 80, ["wallabag"] = 80,
            ["calibre-web"] = 8083, ["komga"] = 25600,
            ["bookstack"] = 80, ["wiki"] = 3000,
        };

        var imageLower = image.Split(':')[0].ToLower();
        foreach (var (key, port) in known)
            if (imageLower.Contains(key)) return port;

        return 8080; // sensible default
    }

    /// Find the next available host port starting from preferred
    private async Task<int> FindAvailablePortAsync(int preferred, string serviceName)
    {
        for (int port = preferred; port < preferred + 100; port++)
        {
            if (port <= 0 || port > 65535) continue;
            var (valid, _) = await _settings.ValidateNewServicePortAsync(port, serviceName);
            if (valid) return port;
        }
        return preferred;
    }
}
