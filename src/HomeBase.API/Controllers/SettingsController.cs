using HomeBase.API.Data;
using HomeBase.API.Models;
using HomeBase.API.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HomeBase.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SettingsController : ControllerBase
{
    private readonly SettingsService _settings;
    private readonly PortAccessService _portAccess;
    private readonly DockerService _docker;
    private readonly AppDbContext _db;

    public SettingsController(SettingsService settings, PortAccessService portAccess, DockerService docker, AppDbContext db)
    {
        _settings = settings;
        _portAccess = portAccess;
        _docker = docker;
        _db = db;
    }

    /// Get all settings grouped by section (secrets masked)
    [HttpGet("env")]
    public async Task<IActionResult> GetEnv() =>
        Ok(await _settings.GetSettingsAsync(raw: false));

    /// Get all settings with real values (for editing)
    [HttpGet("env/raw")]
    public async Task<IActionResult> GetEnvRaw() =>
        Ok(await _settings.GetSettingsAsync(raw: true));

    /// Apply changes with validation
    [HttpPost("env")]
    public async Task<IActionResult> UpdateEnv([FromBody] EnvUpdateRequest request)
    {
        try { return Ok(await _settings.ApplyChangesAsync(request)); }
        catch (Exception ex) { return StatusCode(500, new { error = ex.Message }); }
    }

    /// Validate a port before applying
    [HttpPost("validate-port")]
    public async Task<IActionResult> ValidatePort([FromBody] PortValidationRequest req)
    {
        var (valid, error) = await _settings.ValidatePortAsync(req.Key, req.Value, req.Section);
        return Ok(new { valid, error });
    }

    /// Get port access overview: all ports from containers + rules merged
    [HttpGet("ports/overview")]
    public async Task<IActionResult> GetPortOverview()
    {
        var containers = await _docker.GetContainersAsync();
        return Ok(await _portAccess.GetPortOverviewAsync(containers));
    }

    /// Toggle a port's external access
    [HttpPost("ports/toggle")]
    public async Task<IActionResult> TogglePort([FromBody] PortToggleRequest request)
    {
        try
        {
            var needsRestart = await _portAccess.SetPortExternalAsync(request.Port, request.External, request.ServiceName);
            return Ok(new { ok = true, needsRestart });
        }
        catch (Exception ex) { return StatusCode(500, new { error = ex.Message }); }
    }
}

public record PortValidationRequest(string Key, string Value, string Section);
public record PortToggleRequest(int Port, bool External, string? ServiceName = null);
