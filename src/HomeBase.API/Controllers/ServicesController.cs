using HomeBase.API.Hubs;
using HomeBase.API.Models;
using HomeBase.API.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;

namespace HomeBase.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ServicesController : ControllerBase
{
    private readonly ServiceManagementService _svcMgmt;
    private readonly ComposeParserService _composeParser;
    private readonly IHubContext<DashboardHub> _hub;

    public ServicesController(ServiceManagementService svcMgmt, ComposeParserService composeParser,
        IHubContext<DashboardHub> hub)
    {
        _svcMgmt = svcMgmt;
        _composeParser = composeParser;
        _hub = hub;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var services = await _svcMgmt.GetAllAsync();
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

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        var result = await _svcMgmt.DeleteServiceAsync(id);
        if (!result.Ok && result.Error == "Service not found") return NotFound();
        _ = BroadcastServicesAsync();
        return Ok(result);
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
