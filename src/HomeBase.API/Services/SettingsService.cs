using HomeBase.API.Data;
using HomeBase.API.Models;
using Microsoft.EntityFrameworkCore;
using System.Diagnostics;

namespace HomeBase.API.Services;

public class SettingsService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly FirewallService _firewall;
    private readonly ComposeParserService _composeParser;
    private readonly ComposeFileService _composeFile;
    private readonly IConfiguration _config;
    private readonly ILogger<SettingsService> _logger;

    private static readonly HashSet<int> ReservedPorts = new()
    {
        22, 25, 110, 143, 445, 3389,
    };

    public SettingsService(IServiceScopeFactory scopeFactory, FirewallService firewall,
        ComposeParserService composeParser, ComposeFileService composeFile,
        IConfiguration config, ILogger<SettingsService> logger)
    {
        _scopeFactory = scopeFactory;
        _firewall = firewall;
        _composeParser = composeParser;
        _composeFile = composeFile;
        _config = config;
        _logger = logger;
    }

    private string ProjectDir => _config["Paths:ProjectDir"] ?? "/app/project";

    /// Read all settings from DB grouped by section
    public async Task<List<EnvSectionDto>> GetSettingsAsync(bool raw = false)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var settings = await db.Settings.Include(s => s.Service).OrderBy(s => s.SortOrder).ToListAsync();
        return settings
            .GroupBy(s => s.Section)
            .Select(g => new EnvSectionDto(
                g.Key,
                g.Select(s => new EnvVarDto(
                    s.Key,
                    raw || !s.IsSecret ? s.Value : "********",
                    s.Description,
                    s.IsPortVariable
                )).ToList(),
                g.First().Service?.ComposeName,
                g.First().ServiceId
            ))
            .ToList();
    }

    public async Task<(bool valid, string? error)> ValidatePortAsync(
        string key, string value, string section, HashSet<string>? excludeKeys = null)
    {
        if (!IsPortKey(key)) return (true, null);

        if (!int.TryParse(value, out var port))
            return (false, $"'{value}' gecerli bir port degil (sayi olmali)");

        if (port < 1 || port > 65535)
            return (false, $"Port 1-65535 arasinda olmali (girilen: {port})");

        if (ReservedPorts.Contains(port))
            return (false, $"Port {port} sistem tarafindan kullaniliyor (reserved port)");

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var conflictQuery = db.Settings
            .Where(s => s.IsPortVariable && s.Section != section);

        if (excludeKeys != null && excludeKeys.Count > 0)
            conflictQuery = conflictQuery.Where(s => !excludeKeys.Contains(s.Key));

        var allPortSettings = await conflictQuery.ToListAsync();
        var conflict = allPortSettings.FirstOrDefault(s =>
            int.TryParse(s.Value, out var existingPort) && existingPort == port);

        if (conflict != null)
            return (false, $"Port {port} zaten '{conflict.Section}' tarafindan kullaniliyor ({conflict.Key})");

        var sameSectionConflict = await db.Settings
            .Where(s => s.IsPortVariable && s.Section == section && s.Key != key)
            .ToListAsync();

        if (excludeKeys != null)
            sameSectionConflict = sameSectionConflict.Where(s => !excludeKeys.Contains(s.Key)).ToList();

        var selfConflict = sameSectionConflict.FirstOrDefault(s =>
            int.TryParse(s.Value, out var p) && p == port);

        if (selfConflict != null)
            return (false, $"Port {port} ayni servis icinde '{selfConflict.Key}' tarafindan zaten kullaniliyor");

        try
        {
            var composePorts = _composeParser.GetAllHostPorts();
            if (composePorts.TryGetValue(port, out var portInfo))
            {
                var sectionComposeName = await ResolveComposeNameAsync(db, section);
                if (sectionComposeName != portInfo.ComposeName)
                    return (false, $"Port {port} compose'da '{portInfo.ComposeName}' tarafindan hardcoded olarak kullaniliyor");
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not check compose ports during validation");
        }

        return (true, null);
    }

    public Task<(bool valid, string? error)> ValidatePortAsync(string key, string value, string section)
        => ValidatePortAsync(key, value, section, excludeKeys: null);

    public async Task<(bool valid, string? error)> ValidateNewServicePortAsync(int port, string serviceName)
    {
        if (port < 1 || port > 65535)
            return (false, $"Port {port} gecersiz (1-65535 arasinda olmali)");

        if (ReservedPorts.Contains(port))
            return (false, $"Port {port} sistem tarafindan kullaniliyor");

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var allPorts = await db.Settings.Where(s => s.IsPortVariable).ToListAsync();
        var conflict = allPorts.FirstOrDefault(s => int.TryParse(s.Value, out var p) && p == port);
        if (conflict != null)
            return (false, $"Port {port} zaten '{conflict.Section}' tarafindan kullaniliyor ({conflict.Key})");

        try
        {
            var composePorts = _composeParser.GetAllHostPorts();
            if (composePorts.TryGetValue(port, out var info))
                return (false, $"Port {port} compose'da '{info.ComposeName}' tarafindan kullaniliyor");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Compose port check failed for port {Port}", port);
        }

        return (true, null);
    }

    public async Task<ApplyResult> ApplyChangesAsync(EnvUpdateRequest request)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var changingKeys = request.Changes
            .Where(c => IsPortKey(c.Key))
            .Select(c => c.Key)
            .ToHashSet();

        // 1. Validate
        foreach (var change in request.Changes)
        {
            Setting? setting;
            if (request.ServiceId != null)
                setting = await db.Settings.FirstOrDefaultAsync(s => s.Key == change.Key && s.ServiceId == request.ServiceId);
            else
                setting = await db.Settings.FirstOrDefaultAsync(s => s.Key == change.Key);
            if (setting == null) continue;

            if (IsPortKey(change.Key))
            {
                var otherChangingKeys = new HashSet<string>(changingKeys);
                otherChangingKeys.Remove(change.Key);

                var (valid, error) = await ValidatePortAsync(change.Key, change.Value, setting.Section, otherChangingKeys);
                if (!valid) return new ApplyResult(false, null, error, false);

                if (int.TryParse(change.Value, out var newPort))
                {
                    var batchConflict = request.Changes.FirstOrDefault(c =>
                        c.Key != change.Key && IsPortKey(c.Key)
                        && int.TryParse(c.Value, out var otherPort) && otherPort == newPort);

                    if (batchConflict != null)
                    {
                        var otherSetting = await db.Settings.FirstOrDefaultAsync(s => s.Key == batchConflict.Key);
                        if (otherSetting != null && otherSetting.Section != setting.Section)
                            return new ApplyResult(false, null,
                                $"Port {newPort} ayni batch icerisinde hem '{setting.Section}' ({change.Key}) hem '{otherSetting.Section}' ({batchConflict.Key}) tarafindan talep ediliyor", false);
                    }
                }
            }
        }

        // 2. Apply changes
        var portChanges = new List<PortChange>();
        var affectedServiceIds = new HashSet<int>();

        foreach (var change in request.Changes)
        {
            Setting? setting;
            if (request.ServiceId != null)
                setting = await db.Settings.FirstOrDefaultAsync(s => s.Key == change.Key && s.ServiceId == request.ServiceId);
            else
                setting = await db.Settings.FirstOrDefaultAsync(s => s.Key == change.Key);
            if (setting == null) continue;

            var oldValue = setting.Value;
            if (oldValue == change.Value) continue;

            db.SettingsHistory.Add(new SettingsHistory
            {
                SettingId = setting.Id,
                OldValue = oldValue,
                NewValue = change.Value,
            });

            setting.Value = change.Value;
            setting.UpdatedAt = DateTime.UtcNow;
            setting.Version++;
            if (setting.ServiceId != null)
                affectedServiceIds.Add(setting.ServiceId.Value);

            if (setting.IsPortVariable
                && int.TryParse(oldValue, out var oldP)
                && int.TryParse(change.Value, out var newP)
                && oldP != newP)
            {
                portChanges.Add(new PortChange(oldP, newP, "TCP", setting.Section));
            }

            db.AuditLogs.Add(new AuditLog
            {
                Action = "setting_change",
                Target = change.Key,
                Details = $"{oldValue} → {change.Value}"
            });
        }

        if (!db.ChangeTracker.HasChanges())
            return new ApplyResult(true, null, null, false);

        await db.SaveChangesAsync();

        // 3. Regenerate compose files and recreate affected containers
        string? recreated = null;
        string? error2 = null;

        foreach (var svcId in affectedServiceIds)
        {
            var svc = await db.Services.FindAsync(svcId);
            if (svc?.ComposeFilePath != null)
            {
                try
                {
                    // Regenerate compose with updated env vars from DB
                    await RegenerateServiceComposeAsync(db, svc);

                    var composePath = Path.Combine(ProjectDir, svc.ComposeFilePath);
                    RunShell($"docker stop {svc.ContainerName} 2>/dev/null; docker rm -f {svc.ContainerName} 2>/dev/null", 15000);
                    RunShell($"docker compose -f \"{composePath}\" up -d", 60000);
                    recreated = svc.ContainerName;
                    _logger.LogInformation("Recreated service: {Service}", svc.ServiceSlug);
                }
                catch (Exception ex) { error2 = ex.Message; }
            }
        }

        // 5. Update firewall
        bool fwUpdated = false;
        foreach (var pc in portChanges)
        {
            await _firewall.ClosePortIfUnusedAsync(pc.OldPort, pc.Protocol, excludeSection: pc.Section);
            await _firewall.OpenPortAsync(pc.NewPort, $"SVC-{pc.NewPort}", pc.Protocol, serviceName: pc.Section);
            fwUpdated = true;
        }

        return new ApplyResult(true, recreated, error2, fwUpdated);
    }

    /// Regenerate a service's compose file with current env vars from DB
    private async Task RegenerateServiceComposeAsync(AppDbContext db, Service svc)
    {
        var composeDef = _composeParser.ParseBySlug(svc.ServiceSlug);
        if (composeDef == null) return;

        // Merge current DB settings into compose environment
        var settings = await db.Settings
            .Where(s => s.ServiceId == svc.Id)
            .ToListAsync();

        foreach (var s in settings)
            composeDef.Environment[s.Key] = s.Value;

        await _composeFile.WriteServiceComposeAsync(svc, composeDef);
        _logger.LogInformation("Regenerated compose for {Slug} with {Count} env vars", svc.ServiceSlug, composeDef.Environment.Count);
    }

    private async Task<string?> ResolveComposeNameAsync(AppDbContext db, string section)
    {
        return await db.Services
            .Where(s => s.Name == section)
            .Select(s => s.ComposeName ?? s.ContainerName)
            .FirstOrDefaultAsync();
    }

    /// Create Setting records for a new service (with ServiceId FK)
    public async Task CreateSettingsForServiceAsync(int serviceId, string sectionName,
        Dictionary<string, string> envVars, List<string> portVarNames)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        int order = await db.Settings.CountAsync();

        foreach (var (key, value) in envVars)
        {
            if (await db.Settings.AnyAsync(s => s.ServiceId == serviceId && s.Key == key)) continue;

            var isPort = portVarNames.Contains(key) || key.EndsWith("_PORT");
            var isSecret = key.Contains("PASSWORD", StringComparison.OrdinalIgnoreCase)
                        || key.Contains("SECRET", StringComparison.OrdinalIgnoreCase);

            db.Settings.Add(new Setting
            {
                Section = sectionName,
                Key = key,
                Value = value,
                IsSecret = isSecret,
                IsPortVariable = isPort,
                ServiceId = serviceId,
                SortOrder = order++,
            });
        }

        await db.SaveChangesAsync();
    }

    /// Delete settings by ServiceId
    public async Task DeleteSettingsForServiceAsync(int serviceId)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var settings = await db.Settings.Where(s => s.ServiceId == serviceId).ToListAsync();
        if (settings.Count > 0)
        {
            db.Settings.RemoveRange(settings);
            await db.SaveChangesAsync();
            _logger.LogInformation("Deleted {Count} settings for serviceId={Id}", settings.Count, serviceId);
        }
    }

    /// Delete settings by section name (fallback)
    public async Task DeleteSettingsForServiceAsync(string composeName, string sectionName)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var settings = await db.Settings
            .Where(s => !string.IsNullOrEmpty(sectionName) && s.Section == sectionName)
            .ToListAsync();

        if (settings.Count > 0)
        {
            db.Settings.RemoveRange(settings);
            await db.SaveChangesAsync();
            _logger.LogInformation("Deleted {Count} settings for {Service}", settings.Count, sectionName);
        }
    }

    private static bool IsPortKey(string key)
    {
        return key.EndsWith("_PORT", StringComparison.OrdinalIgnoreCase);
    }

    private void RunShell(string command, int timeoutMs)
    {
        var shell = OperatingSystem.IsWindows() ? "cmd.exe" : "/bin/sh";
        var args = OperatingSystem.IsWindows() ? $"/c {command}" : $"-c \"{command.Replace("\"", "\\\"")}\"";
        var psi = new ProcessStartInfo(shell, args)
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };
        using var proc = Process.Start(psi)!;
        proc.WaitForExit(timeoutMs);
    }

    private record PortChange(int OldPort, int NewPort, string Protocol, string Section);
}
