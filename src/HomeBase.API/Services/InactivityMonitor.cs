using HomeBase.API.Data;
using HomeBase.API.Models;
using Microsoft.EntityFrameworkCore;

namespace HomeBase.API.Services;

public class InactivityMonitor : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly DockerService _docker;
    private readonly DockerCacheService _cache;
    private readonly ILogger<InactivityMonitor> _logger;
    private readonly Dictionary<string, (long rx, long tx, DateTime lastChange)> _tracker = new();
    private readonly TimeSpan _inactivityLimit = TimeSpan.FromHours(1);

    public InactivityMonitor(IServiceScopeFactory scopeFactory, DockerService docker,
        DockerCacheService cache, ILogger<InactivityMonitor> logger)
    {
        _scopeFactory = scopeFactory;
        _docker = docker;
        _cache = cache;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Inactivity monitor started (threshold: {Minutes}min)", _inactivityLimit.TotalMinutes);

        // On startup: enforce disabled states (wait for containers to be fully up first)
        await Task.Delay(15000, stoppingToken);
        await EnforceDisabledStatesAsync();

        while (!stoppingToken.IsCancellationRequested)
        {
            await Task.Delay(60000, stoppingToken);
            await CheckInactivityAsync();
        }
    }

    /// Enforce disabled states on startup — stop containers that user had manually stopped
    private async Task EnforceDisabledStatesAsync()
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var disabled = await db.ContainerStates.Where(s => s.IsDisabled).ToListAsync();

            if (disabled.Count == 0) return;

            _logger.LogInformation("Enforcing {Count} disabled container states", disabled.Count);

            foreach (var state in disabled)
            {
                // Skip protected containers
                if (_docker.IsProtected(state.ContainerName))
                {
                    _logger.LogWarning("Skipping protected container '{Name}' in disabled enforcement", state.ContainerName);
                    // Clear the disabled flag since we can't stop protected containers
                    state.IsDisabled = false;
                    state.UpdatedAt = DateTime.UtcNow;
                    continue;
                }

                try
                {
                    // Use StopContainerAsync which handles already-stopped gracefully
                    await _docker.StopContainerAsync(state.ContainerName);
                    _logger.LogInformation("Enforced disabled state: stopped '{Name}'", state.ContainerName);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Could not enforce disabled state for '{Name}'", state.ContainerName);
                }
            }

            await db.SaveChangesAsync();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error enforcing disabled states");
        }
    }

    private async Task CheckInactivityAsync()
    {
        try
        {
            var containers = await _cache.GetCachedContainersAsync();
            var now = DateTime.UtcNow;

            foreach (var c in containers.Where(c => c.State == "running" && !c.Protected && !c.UserDisabled))
            {
                var rx = c.Stats?.RxBytes ?? 0;
                var tx = c.Stats?.TxBytes ?? 0;

                if (!_tracker.TryGetValue(c.Name, out var prev))
                {
                    _tracker[c.Name] = (rx, tx, now);
                    continue;
                }

                if (rx != prev.rx || tx != prev.tx)
                {
                    _tracker[c.Name] = (rx, tx, now);
                }
                else if (now - prev.lastChange >= _inactivityLimit)
                {
                    _logger.LogInformation("Auto-stopping '{Name}' (idle for {Min}min)", c.Name, (int)(now - prev.lastChange).TotalMinutes);
                    try
                    {
                        await _docker.StopContainerAsync(c.Name);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed to auto-stop '{Name}'", c.Name);
                    }
                    _tracker.Remove(c.Name);
                }
            }

            // Clean up tracker for containers that no longer exist
            var activeNames = containers.Select(c => c.Name).ToHashSet();
            var staleKeys = _tracker.Keys.Where(k => !activeNames.Contains(k)).ToList();
            foreach (var key in staleKeys) _tracker.Remove(key);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Inactivity check error");
        }
    }
}
