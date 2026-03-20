using HomeBase.API.Data;
using HomeBase.API.Hubs;
using HomeBase.API.Models;
using HomeBase.API.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace HomeBase.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ContainersController : ControllerBase
{
    private readonly DockerService _docker;
    private readonly AppDbContext _db;
    private readonly IHubContext<DashboardHub> _hub;

    public ContainersController(DockerService docker, AppDbContext db, IHubContext<DashboardHub> hub)
    {
        _docker = docker;
        _db = db;
        _hub = hub;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        try { return Ok(await _docker.GetContainersAsync()); }
        catch (Exception ex) { return StatusCode(500, new ApiError("DOCKER_ERROR", "Failed to list containers", ex.Message)); }
    }

    [HttpPost("{name}/start")]
    public async Task<IActionResult> Start(string name)
    {
        try
        {
            await _docker.StartContainerAsync(name);
            _ = _docker.NotifyCacheRefreshAsync();
            return Ok(new { ok = true, action = "started", name });
        }
        catch (Exception ex) when (ex.Message.Contains("not found"))
        {
            return NotFound(new ApiError("CONTAINER_NOT_FOUND", ex.Message));
        }
        catch (Exception ex) when (ex.Message.Contains("port") || ex.Message.Contains("Port"))
        {
            return BadRequest(new ApiError("PORT_CONFLICT", ex.Message));
        }
        catch (Exception ex)
        {
            return BadRequest(new ApiError("DOCKER_ERROR", ex.Message));
        }
    }

    [HttpPost("{name}/stop")]
    public async Task<IActionResult> Stop(string name)
    {
        try
        {
            await _docker.StopContainerAsync(name);
            _ = _docker.NotifyCacheRefreshAsync();
            return Ok(new { ok = true, action = "stopped", name });
        }
        catch (Exception ex) when (ex.Message.Contains("Protected"))
        {
            return BadRequest(new ApiError("CONTAINER_PROTECTED", "Bu container korunuyor ve durdurulamaz"));
        }
        catch (Exception ex)
        {
            return BadRequest(new ApiError("DOCKER_ERROR", ex.Message));
        }
    }

    [HttpPost("{name}/restart")]
    public async Task<IActionResult> Restart(string name)
    {
        try
        {
            await _docker.RestartContainerAsync(name);
            _ = _docker.NotifyCacheRefreshAsync();
            return Ok(new { ok = true, action = "restarted", name });
        }
        catch (Exception ex)
        {
            return BadRequest(new ApiError("DOCKER_ERROR", ex.Message));
        }
    }

    [HttpGet("{name}/logs")]
    public async Task<IActionResult> GetLogs(string name, [FromQuery] int lines = 200, [FromQuery] bool timestamps = true)
    {
        try
        {
            var logs = await _docker.GetContainerLogsAsync(name, lines, timestamps);
            return Ok(new { logs });
        }
        catch (Exception ex) when (ex.Message.Contains("not found"))
        {
            return NotFound(new ApiError("CONTAINER_NOT_FOUND", $"Container '{name}' not found"));
        }
        catch (Exception ex)
        {
            return StatusCode(500, new ApiError("DOCKER_ERROR", "Failed to fetch logs", ex.Message));
        }
    }

    [HttpGet("{name}/inspect")]
    public async Task<IActionResult> Inspect(string name)
    {
        try
        {
            var result = await _docker.InspectContainerAsync(name);
            if (result == null) return NotFound(new ApiError("CONTAINER_NOT_FOUND", $"Container '{name}' not found"));
            return Ok(result);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new ApiError("DOCKER_ERROR", "Inspect failed", ex.Message));
        }
    }

    [HttpGet("disabled")]
    public async Task<IActionResult> GetDisabled()
    {
        try
        {
            var disabled = await _db.Services
                .Where(s => !s.IsEnabled)
                .Select(s => new { s.Id, s.Name, s.ContainerName, s.ComposeName })
                .ToListAsync();
            return Ok(disabled);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new ApiError("DB_ERROR", "Devre dışı servisler alınamadı", ex.Message));
        }
    }

    [HttpPost("enable-all")]
    public async Task<IActionResult> EnableAll()
    {
        try
        {
            var disabled = await _db.Services.Where(s => !s.IsEnabled).ToListAsync();
            foreach (var svc in disabled)
            {
                svc.IsEnabled = true;
                svc.UpdatedAt = DateTime.UtcNow;
            }
            await _db.SaveChangesAsync();
            return Ok(new { ok = true, enabled = disabled.Count });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new ApiError("DB_ERROR", "Toplu etkinleştirme başarısız", ex.Message));
        }
    }
}
