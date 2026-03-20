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
    private readonly FirewallService _firewall;
    private readonly AppDbContext _db;

    public SettingsController(SettingsService settings, FirewallService firewall, AppDbContext db)
    {
        _settings = settings;
        _firewall = firewall;
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

    /// Sync firewall state — queue open commands for all active ports
    [HttpPost("firewall/sync")]
    public async Task<IActionResult> SyncFirewall()
    {
        try
        {
            await _firewall.SyncFirewallStateAsync();
            return Ok(new { ok = true, message = "Firewall sync queued" });
        }
        catch (Exception ex) { return StatusCode(500, new { error = ex.Message }); }
    }

    /// Get all port states (port, isExternal, serviceName)
    [HttpGet("firewall/ports")]
    public async Task<IActionResult> GetPortStates()
    {
        return Ok(await _firewall.GetPortStatesAsync());
    }

    /// Toggle a port's external access
    [HttpPost("firewall/toggle")]
    public async Task<IActionResult> TogglePort([FromBody] PortToggleRequest request)
    {
        try
        {
            await _firewall.SetPortExternalAsync(request.Port, request.External, request.ServiceName);
            return Ok(new { ok = true });
        }
        catch (Exception ex) { return StatusCode(500, new { error = ex.Message }); }
    }
}

public record PortValidationRequest(string Key, string Value, string Section);
public record PortToggleRequest(int Port, bool External, string? ServiceName = null);
