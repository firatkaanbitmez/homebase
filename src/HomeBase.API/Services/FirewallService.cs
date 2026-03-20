using HomeBase.API.Data;
using HomeBase.API.Models;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace HomeBase.API.Services;

public class FirewallService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<FirewallService> _logger;
    private readonly string _queuePath;
    private static readonly object _queueLock = new();

    public FirewallService(IServiceScopeFactory scopeFactory, IConfiguration config, ILogger<FirewallService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
        _queuePath = config["Paths:FirewallQueue"] ?? "/app/data/firewall-queue.json";
    }

    /// Open a port in the firewall.
    public async Task OpenPortAsync(int port, string name, string protocol = "TCP", string? serviceName = null)
    {
        protocol = NormalizeProtocol(protocol);
        AppendToQueue(new { action = "open", name, port, protocol = protocol.ToLower() });
        await SaveRuleAsync(name, port, protocol, active: true, serviceName: serviceName);
        _logger.LogInformation("Queued firewall open: {Protocol}/{Port} ({Name})", protocol, port, name);
    }

    /// Set whether a port is externally accessible.
    public async Task SetPortExternalAsync(int port, bool external, string? serviceName = null)
    {
        var protocol = "TCP";
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        // Resolve ServiceId from serviceName
        int? serviceId = null;
        if (!string.IsNullOrEmpty(serviceName))
        {
            serviceId = await db.Services
                .Where(s => s.Name == serviceName || s.ComposeName == serviceName || s.ContainerName == serviceName)
                .Select(s => (int?)s.Id)
                .FirstOrDefaultAsync();
        }

        var rule = await db.FirewallRules.FirstOrDefaultAsync(r => r.Port == port && r.Protocol == protocol);
        if (rule == null)
        {
            rule = new FirewallRule { Name = $"SVC-{port}", Port = port, Protocol = protocol, IsActive = true, IsExternal = external, ServiceId = serviceId };
            db.FirewallRules.Add(rule);
        }
        else
        {
            rule.IsExternal = external;
            if (serviceId != null) rule.ServiceId = serviceId;
        }

        if (external)
            AppendToQueue(new { action = "open", name = rule.Name, port, protocol = protocol.ToLower() });
        else
            AppendToQueue(new { action = "close", name = rule.Name, port, protocol = protocol.ToLower() });

        db.AuditLogs.Add(new AuditLog
        {
            Action = "firewall",
            Target = $"{(external ? "external" : "local")}:{protocol}/{port}",
            Details = serviceName ?? rule.Name
        });
        await db.SaveChangesAsync();
        _logger.LogInformation("Port {Port} set to {State}", port, external ? "external" : "local-only");
    }

    /// Get all port states for the UI.
    public async Task<List<PortStateDto>> GetPortStatesAsync()
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var rules = await db.FirewallRules.Include(r => r.Service).ToListAsync();
        return rules.Select(r => new PortStateDto(
            r.Port, r.IsExternal, r.Service?.Name ?? r.Service?.ComposeName, r.Protocol
        )).ToList();
    }

    /// Close a port — but ONLY if no other service still needs it.
    public async Task ClosePortIfUnusedAsync(int port, string protocol = "TCP", string? excludeSection = null)
    {
        protocol = NormalizeProtocol(protocol);

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var stillInUse = await db.Settings
            .Where(s => s.IsPortVariable
                && s.Value == port.ToString()
                && (excludeSection == null || s.Section != excludeSection))
            .AnyAsync();

        if (stillInUse)
        {
            _logger.LogInformation("Port {Port} still in use by another service, keeping firewall rule", port);
            return;
        }

        AppendToQueue(new { action = "close", name = $"SVC-{port}", port, protocol = protocol.ToLower() });

        var rule = await db.FirewallRules.FirstOrDefaultAsync(r => r.Port == port && r.Protocol == protocol);
        if (rule != null)
        {
            db.FirewallRules.Remove(rule);
            db.AuditLogs.Add(new AuditLog
            {
                Action = "firewall",
                Target = $"close:{protocol}/{port}",
                Details = rule.Name
            });
            await db.SaveChangesAsync();
        }

        _logger.LogInformation("Queued firewall close: {Protocol}/{Port}", protocol, port);
    }

    /// Full sync: REPLACES queue with the complete desired state.
    public async Task SyncFirewallStateAsync()
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var activePortSettings = await db.Settings
            .Where(s => s.IsPortVariable)
            .Select(s => new { s.Value, s.Section, s.ServiceId })
            .ToListAsync();

        var portServiceMap = new Dictionary<int, int?>();
        var activePorts = new HashSet<int>();
        foreach (var ps in activePortSettings)
        {
            if (int.TryParse(ps.Value, out var p) && p > 0 && p <= 65535)
            {
                activePorts.Add(p);
                portServiceMap.TryAdd(p, ps.ServiceId);
            }
        }

        var rules = await db.FirewallRules.ToListAsync();
        var commands = new List<object>();

        foreach (var port in activePorts)
        {
            commands.Add(new { action = "open", name = $"SVC-{port}", port, protocol = "tcp" });

            var rule = rules.FirstOrDefault(r => r.Port == port);
            if (rule == null)
            {
                db.FirewallRules.Add(new FirewallRule
                {
                    Name = $"SVC-{port}",
                    Port = port,
                    Protocol = "TCP",
                    IsActive = true,
                    ServiceId = portServiceMap.GetValueOrDefault(port)
                });
            }
            else
            {
                if (!rule.IsActive) rule.IsActive = true;
                if (rule.ServiceId == null && portServiceMap.ContainsKey(port))
                    rule.ServiceId = portServiceMap[port];
            }
        }

        foreach (var rule in rules)
        {
            if (!activePorts.Contains(rule.Port))
            {
                commands.Add(new { action = "close", name = rule.Name, port = rule.Port, protocol = rule.Protocol.ToLower() });
                if (rule.IsActive)
                {
                    rule.IsActive = false;
                    _logger.LogInformation("Firewall sync: closing orphaned port {Port}", rule.Port);
                }
            }
        }

        ReplaceQueue(commands);
        await db.SaveChangesAsync();
        _logger.LogInformation("Firewall sync: wrote {Count} commands ({Active} open, {Close} close)",
            commands.Count, activePorts.Count, commands.Count - activePorts.Count);
    }

    private void AppendToQueue(object command)
    {
        lock (_queueLock)
        {
            try
            {
                var newCmd = JsonSerializer.SerializeToElement(command);
                var newPort = newCmd.TryGetProperty("port", out var np) ? np.GetInt32() : -1;
                var newAction = newCmd.TryGetProperty("action", out var na) ? na.GetString() : "";

                var commands = new List<JsonElement>();

                if (File.Exists(_queuePath))
                {
                    try
                    {
                        var existing = JsonSerializer.Deserialize<JsonElement>(File.ReadAllText(_queuePath));
                        if (existing.TryGetProperty("commands", out var cmds))
                        {
                            foreach (var c in cmds.EnumerateArray())
                            {
                                var cPort = c.TryGetProperty("port", out var cp) ? cp.GetInt32() : -2;
                                var cAction = c.TryGetProperty("action", out var ca) ? ca.GetString() : "";
                                if (cPort == newPort && cAction == newAction) continue;
                                if (cPort == newPort && cAction != newAction) continue;
                                commands.Add(c);
                            }
                        }
                    }
                    catch { }
                }

                commands.Add(newCmd);
                EnsureQueueDir();
                File.WriteAllText(_queuePath, JsonSerializer.Serialize(new { commands }));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to append to firewall queue");
            }
        }
    }

    private void ReplaceQueue(List<object> commands)
    {
        lock (_queueLock)
        {
            try
            {
                var deduped = new Dictionary<int, object>();
                foreach (var cmd in commands)
                {
                    var el = JsonSerializer.SerializeToElement(cmd);
                    var port = el.TryGetProperty("port", out var p) ? p.GetInt32() : 0;
                    if (port > 0) deduped[port] = cmd;
                }

                EnsureQueueDir();
                var finalCommands = deduped.Values.ToList();
                File.WriteAllText(_queuePath, JsonSerializer.Serialize(new { commands = finalCommands }));
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to write firewall queue");
            }
        }
    }

    private void EnsureQueueDir()
    {
        var dir = Path.GetDirectoryName(_queuePath);
        if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
    }

    private async Task SaveRuleAsync(string name, int port, string protocol, bool active, string? serviceName = null)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        // Resolve ServiceId from serviceName
        int? serviceId = null;
        if (!string.IsNullOrEmpty(serviceName))
        {
            serviceId = await db.Services
                .Where(s => s.Name == serviceName || s.ComposeName == serviceName || s.ContainerName == serviceName)
                .Select(s => (int?)s.Id)
                .FirstOrDefaultAsync();
        }

        var existing = await db.FirewallRules
            .FirstOrDefaultAsync(r => r.Port == port && r.Protocol == protocol);

        if (existing == null)
        {
            db.FirewallRules.Add(new FirewallRule
            {
                Name = name,
                Port = port,
                Protocol = protocol,
                IsActive = active,
                ServiceId = serviceId
            });
        }
        else
        {
            existing.Name = name;
            existing.IsActive = active;
            if (serviceId != null) existing.ServiceId = serviceId;
        }

        db.AuditLogs.Add(new AuditLog
        {
            Action = "firewall",
            Target = $"{(active ? "open" : "close")}:{protocol}/{port}",
            Details = name
        });
        await db.SaveChangesAsync();
    }

    private static string NormalizeProtocol(string protocol)
    {
        var p = protocol.Trim().ToUpper();
        return p is "TCP" or "UDP" ? p : "TCP";
    }
}

public record PortStateDto(int Port, bool IsExternal, string? ServiceName, string Protocol);
