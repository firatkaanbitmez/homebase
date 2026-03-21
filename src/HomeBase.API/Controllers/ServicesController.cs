using HomeBase.API.Data;
using HomeBase.API.Hubs;
using HomeBase.API.Models;
using HomeBase.API.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using System.Diagnostics;

namespace HomeBase.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ServicesController : ControllerBase
{
    private readonly ServiceManagementService _svcMgmt;
    private readonly ComposeParserService _composeParser;
    private readonly ComposeFileService _composeFile;
    private readonly AiService _aiService;
    private readonly DockerService _docker;
    private readonly AppDbContext _db;
    private readonly IHubContext<DashboardHub> _hub;
    private readonly ILogger<ServicesController> _logger;

    public ServicesController(ServiceManagementService svcMgmt, ComposeParserService composeParser,
        ComposeFileService composeFile, AiService aiService, DockerService docker, AppDbContext db,
        IHubContext<DashboardHub> hub, ILogger<ServicesController> logger)
    {
        _svcMgmt = svcMgmt;
        _composeParser = composeParser;
        _composeFile = composeFile;
        _aiService = aiService;
        _docker = docker;
        _db = db;
        _hub = hub;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var services = await _svcMgmt.GetAllAsync();

        // Clear stale DeployStatus for services whose containers are now running
        var stale = services.Where(s => s.DeployStatus != null && s.ContainerName != null).ToList();
        if (stale.Any())
        {
            try
            {
                var containers = await _docker.GetContainersAsync();
                var runningNames = containers.Where(c => c.State == "running")
                    .Select(c => c.Name).ToHashSet();

                var cleared = false;
                foreach (var s in stale)
                {
                    if (runningNames.Contains(s.ContainerName!))
                    {
                        s.DeployStatus = null;
                        cleared = true;
                    }
                }
                if (cleared) await _db.SaveChangesAsync();
            }
            catch { /* non-critical */ }
        }

        var response = services.Select(s => new ServiceResponse(
            s.Id, s.Name, s.Description, s.Icon, s.Color,
            s.ContainerName, s.PreferPort, s.UrlPath, s.IsEnabled,
            s.SortOrder, s.ComposeName, s.Image, s.BuildContext,
            s.EnvFile, s.IsAutoDiscovered, s.Category?.Name, s.CategoryId,
            s.ServiceSlug, s.ComposeFilePath, s.DeployStatus
        ));
        return Ok(response);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> Get(int id)
    {
        var svc = await _svcMgmt.GetByIdAsync(id);
        if (svc == null) return NotFound();
        return Ok(new ServiceResponse(
            svc.Id, svc.Name, svc.Description, svc.Icon, svc.Color,
            svc.ContainerName, svc.PreferPort, svc.UrlPath, svc.IsEnabled,
            svc.SortOrder, svc.ComposeName, svc.Image, svc.BuildContext,
            svc.EnvFile, svc.IsAutoDiscovered, svc.Category?.Name, svc.CategoryId,
            svc.ServiceSlug, svc.ComposeFilePath, svc.DeployStatus
        ));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Service svc)
    {
        var created = await _svcMgmt.CreateAsync(svc);
        _ = BroadcastServicesAsync();
        return Ok(created);
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(int id, [FromBody] Service updated)
    {
        var svc = await _svcMgmt.UpdateAsync(id, updated);
        if (svc == null) return NotFound();
        _ = BroadcastServicesAsync();
        return Ok(svc);
    }

    [HttpPatch("{id}/url-path")]
    public async Task<IActionResult> UpdateUrlPath(int id, [FromBody] Dictionary<string, string> body)
    {
        var svc = await _svcMgmt.GetByIdAsync(id);
        if (svc == null) return NotFound();
        svc.UrlPath = body.TryGetValue("urlPath", out var p) ? p : null;
        await _svcMgmt.UpdateAsync(id, svc);
        _ = BroadcastServicesAsync();
        return Ok(new { ok = true });
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        var result = await _svcMgmt.DeleteServiceAsync(id);
        if (!result.Ok && result.Error == "Service not found") return NotFound();
        _ = BroadcastServicesAsync();
        return Ok(result);
    }

    [HttpGet("{id}/compose")]
    public async Task<IActionResult> GetCompose(int id)
    {
        var svc = await _svcMgmt.GetByIdAsync(id);
        if (svc == null) return NotFound();
        if (string.IsNullOrEmpty(svc.ServiceSlug))
            return NotFound(new ApiError("NO_COMPOSE", "Service has no compose file"));

        var composePath = _composeFile.GetComposeFilePath(svc.ServiceSlug);
        if (!System.IO.File.Exists(composePath))
            return NotFound(new ApiError("NO_FILE", "Compose file not found"));

        var yaml = await System.IO.File.ReadAllTextAsync(composePath);
        return Ok(new { yaml, path = composePath });
    }

    [HttpPut("{id}/compose")]
    public async Task<IActionResult> UpdateCompose(int id, [FromBody] ComposeUpdateRequest request)
    {
        var svc = await _svcMgmt.GetByIdAsync(id);
        if (svc == null) return NotFound();
        if (string.IsNullOrEmpty(svc.ServiceSlug))
            return BadRequest(new ApiError("NO_COMPOSE", "Service has no compose file"));

        var composePath = _composeFile.GetComposeFilePath(svc.ServiceSlug);
        await System.IO.File.WriteAllTextAsync(composePath, request.Yaml);

        // Recreate the container via docker compose
        try
        {
            var serviceDir = Path.GetDirectoryName(composePath)!;
            var psi = new ProcessStartInfo("/bin/sh", $"-c \"cd '{serviceDir}' && docker compose up -d --force-recreate\"")
            {
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };
            using var proc = Process.Start(psi)!;
            await proc.WaitForExitAsync();
            var err = await proc.StandardError.ReadToEndAsync();
            if (proc.ExitCode != 0)
                return Ok(new { ok = true, recreated = true, warning = err });
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to recreate container for {Slug}", svc.ServiceSlug);
            return Ok(new { ok = true, recreated = false, warning = ex.Message });
        }

        return Ok(new { ok = true, recreated = true });
    }

    [HttpPost("{id}/compose/ai-assist")]
    public async Task<IActionResult> AiAssistCompose(int id, [FromBody] ComposeAiAssistRequest? request = null)
    {
        var svc = await _svcMgmt.GetByIdAsync(id);
        if (svc == null) return NotFound();
        if (string.IsNullOrEmpty(svc.ServiceSlug))
            return BadRequest(new ApiError("NO_COMPOSE", "Service has no compose file"));

        var composePath = _composeFile.GetComposeFilePath(svc.ServiceSlug);
        var yaml = request?.Yaml;
        if (string.IsNullOrEmpty(yaml))
        {
            if (!System.IO.File.Exists(composePath))
                return NotFound(new ApiError("NO_FILE", "Compose file not found"));
            yaml = await System.IO.File.ReadAllTextAsync(composePath);
        }

        try
        {
            if (!string.IsNullOrEmpty(request?.Instruction))
            {
                // Chat mode: AI modifies YAML based on instruction
                var result = await _aiService.ModifyComposeAsync(yaml, request.Instruction, svc.Image);
                return Ok(result);
            }
            else
            {
                // General suggestions mode
                var suggestions = await _aiService.AssistComposeAsync(yaml, svc.Image);
                return Ok(new { suggestions });
            }
        }
        catch (Exception ex)
        {
            return BadRequest(new ApiError("AI_ERROR", ex.Message));
        }
    }

    private async Task BroadcastServicesAsync()
    {
        try
        {
            var all = await _svcMgmt.GetAllAsync();
            var response = all.Select(s => new ServiceResponse(
                s.Id, s.Name, s.Description, s.Icon, s.Color,
                s.ContainerName, s.PreferPort, s.UrlPath, s.IsEnabled,
                s.SortOrder, s.ComposeName, s.Image, s.BuildContext,
                s.EnvFile, s.IsAutoDiscovered, s.Category?.Name, s.CategoryId,
                s.ServiceSlug, s.ComposeFilePath, s.DeployStatus
            )).ToList();
            await _hub.Clients.All.SendAsync("ServicesUpdated", response);
        }
        catch { }
    }

    /// Sync compose definitions to DB — discovers new services, removes orphans
    [HttpPost("sync")]
    public async Task<IActionResult> SyncCompose()
    {
        var result = await _svcMgmt.SyncComposeToDbAsync();
        return Ok(result);
    }

    /// Get parsed compose data
    [HttpGet("compose")]
    public IActionResult GetCompose()
    {
        var defs = _composeParser.ParseAll();
        // Also include infra
        defs.AddRange(_composeParser.ParseInfra());
        var response = defs.Select(d => new ComposeServiceResponse(
            d.ComposeName, d.ContainerName, d.Image, d.BuildContext,
            d.Ports, d.EnvFiles, d.Environment, d.Volumes,
            d.DependsOn, d.RestartPolicy
        ));
        return Ok(response);
    }
}
