using HomeBase.API.Data;
using HomeBase.API.Models;
using Microsoft.EntityFrameworkCore;
using System.Diagnostics;
using System.Text.RegularExpressions;

namespace HomeBase.API.Services;

public class PortAccessService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IConfiguration _config;
    private readonly ILogger<PortAccessService> _logger;

    public PortAccessService(IServiceScopeFactory scopeFactory, IConfiguration config, ILogger<PortAccessService> logger)
    {
        _scopeFactory = scopeFactory;
        _config = config;
        _logger = logger;
    }

    private string ProjectDir => _config["Paths:ProjectDir"] ?? "/app/project";

    /// Toggle a port's external access by rewriting the compose port binding.
    /// Returns true if the change requires a restart (e.g. dashboard toggling itself).
    public async Task<bool> SetPortExternalAsync(int port, bool external, string? serviceName = null)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        int? serviceId = null;
        Service? svc = null;
        if (!string.IsNullOrEmpty(serviceName))
        {
            svc = await db.Services
                .FirstOrDefaultAsync(s => s.Name == serviceName || s.ComposeName == serviceName || s.ContainerName == serviceName);
            serviceId = svc?.Id;
        }

        // Save/update port access rule in DB
        var rule = await db.PortAccessRules.FirstOrDefaultAsync(r => r.Port == port && r.Protocol == "TCP");
        if (rule == null)
        {
            rule = new PortAccessRule { Name = $"SVC-{port}", Port = port, Protocol = "TCP", IsActive = true, IsExternal = external, ServiceId = serviceId };
            db.PortAccessRules.Add(rule);
        }
        else
        {
            rule.IsExternal = external;
            if (serviceId != null) rule.ServiceId = serviceId;
        }

        db.AuditLogs.Add(new AuditLog
        {
            Action = "port-access",
            Target = $"{(external ? "external" : "local")}:TCP/{port}",
            Details = serviceName ?? rule.Name
        });
        await db.SaveChangesAsync();

        // Rewrite compose port binding and recreate container
        var containerName = svc?.ContainerName;
        bool needsRestart = false;
        if (containerName != null)
            needsRestart = await RewritePortBindingAsync(port, external, containerName, svc);

        _logger.LogInformation("Port {Port} set to {State} for {Service}", port, external ? "external" : "local-only", serviceName ?? "unknown");
        return needsRestart;
    }

    /// Rewrite port binding in the compose file. Returns true if it's a self-restart.
    private async Task<bool> RewritePortBindingAsync(int port, bool external, string containerName, Service? svc)
    {
        var composePath = FindComposeFileForContainer(containerName, svc);
        if (composePath == null || !File.Exists(composePath))
        {
            _logger.LogWarning("No compose file found for container {Name}", containerName);
            return false;
        }

        var content = await File.ReadAllTextAsync(composePath);
        var updated = RewritePortInYaml(content, port, external);

        if (updated == content) return false;

        await File.WriteAllTextAsync(composePath, updated);
        _logger.LogInformation("Rewrote port binding in {Path}: port {Port} → {State}", composePath, port, external ? "0.0.0.0" : "127.0.0.1");

        // Protected containers (homebase infra) require manual restart.
        var protectedContainers = new[] { "homebase-api", "homebase-db" };
        if (protectedContainers.Any(p => containerName.Contains(p)))
        {
            _logger.LogInformation("Port binding updated for protected container {Name}. Manual restart required.", containerName);
            return true;
        }

        RunCompose(composePath);
        return false;
    }

    /// Find the compose file that defines a given container
    private string? FindComposeFileForContainer(string containerName, Service? svc)
    {
        if (svc?.ComposeFilePath != null)
        {
            var path = Path.Combine(ProjectDir, svc.ComposeFilePath);
            if (File.Exists(path)) return path;
        }

        var rootCompose = Path.Combine(ProjectDir, "docker-compose.yml");
        if (File.Exists(rootCompose))
        {
            var content = File.ReadAllText(rootCompose);
            if (content.Contains(containerName))
                return rootCompose;
        }

        return null;
    }

    /// Rewrite a specific port's binding in YAML content
    internal static string RewritePortInYaml(string yaml, int port, bool external)
    {
        var bindPrefix = external ? "" : "127.0.0.1:";

        // First, try to match with existing bind address
        var addrPattern = new Regex($@"(- *""?)(127\.0\.0\.1|0\.0\.0\.0):({port}:\d+)");
        if (addrPattern.IsMatch(yaml))
        {
            return addrPattern.Replace(yaml, m =>
                $"{m.Groups[1].Value}{bindPrefix}{m.Groups[3].Value}");
        }

        // No bind address present — add or keep without
        var plainPattern = new Regex($@"(- *""?)({port}:\d+)");
        if (plainPattern.IsMatch(yaml))
        {
            return plainPattern.Replace(yaml, m =>
                $"{m.Groups[1].Value}{bindPrefix}{m.Groups[2].Value}");
        }

        // Handle variable-style ports like "${VAR:-PORT}:container"
        var varPattern = new Regex(@"(- *""?)(127\.0\.0\.1:|0\.0\.0\.0:)?(\$\{[^}]+:-?" + port + @"\}:\d+)");
        if (varPattern.IsMatch(yaml))
        {
            return varPattern.Replace(yaml, m =>
                $"{m.Groups[1].Value}{bindPrefix}{m.Groups[3].Value}");
        }

        return yaml;
    }

    /// Recreate container(s) via docker compose up -d --force-recreate
    private void RunCompose(string composePath)
    {
        try
        {
            var projectDir = Path.GetDirectoryName(composePath)!;
            var shell = OperatingSystem.IsWindows() ? "cmd.exe" : "/bin/sh";
            var shellArgs = OperatingSystem.IsWindows()
                ? $"/c docker compose -f \"{composePath}\" --project-directory \"{projectDir}\" up -d --force-recreate"
                : $"-c \"docker compose -f \\\"{composePath}\\\" --project-directory \\\"{projectDir}\\\" up -d --force-recreate\"";
            var psi = new ProcessStartInfo(shell, shellArgs)
            {
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };
            using var proc = Process.Start(psi)!;
            var stderr = proc.StandardError.ReadToEnd();
            proc.WaitForExit(30000);
            if (proc.ExitCode != 0)
                _logger.LogWarning("RunCompose failed for {Path}: {Err}", composePath, stderr);
            else
                _logger.LogInformation("Recreated containers via compose: {Path}", composePath);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to run compose for {Path}", composePath);
        }
    }


    /// Get a complete port access overview: all ports from containers + rules merged.
    public async Task<List<PortAccessEntry>> GetPortOverviewAsync(List<ContainerDto> runningContainers)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var rules = await db.PortAccessRules.Include(r => r.Service).ToListAsync();
        var services = await db.Services.ToListAsync();
        var result = new Dictionary<int, PortAccessEntry>();

        foreach (var ctr in runningContainers)
        {
            if (ctr.Ports == null) continue;
            var svc = services.FirstOrDefault(s => s.ContainerName == ctr.Name);
            foreach (var p in ctr.Ports.Where(p => p.Public > 0))
            {
                var rule = rules.FirstOrDefault(r => r.Port == p.Public && r.Protocol == "TCP");
                // Truth = actual Docker binding IP. 127.0.0.1 = local, anything else = external.
                var actuallyExternal = !string.Equals(p.Ip, "127.0.0.1", StringComparison.Ordinal);
                // Sync DB rule if it disagrees with reality
                if (rule != null && rule.IsExternal != actuallyExternal)
                {
                    rule.IsExternal = actuallyExternal;
                    await db.SaveChangesAsync();
                }
                result.TryAdd(p.Public, new PortAccessEntry(
                    p.Public, "TCP", svc?.Name ?? ctr.Name, ctr.Name,
                    actuallyExternal, rule != null, svc?.Id
                ));
            }
        }

        foreach (var rule in rules)
        {
            if (result.ContainsKey(rule.Port)) continue;
            var svc = rule.Service ?? services.FirstOrDefault(s => s.Id == rule.ServiceId);
            result.TryAdd(rule.Port, new PortAccessEntry(
                rule.Port, rule.Protocol, svc?.Name ?? rule.Name, svc?.ContainerName,
                rule.IsExternal, true, svc?.Id
            ));
        }

        return result.Values.OrderBy(e => e.Port).ToList();
    }

    /// Close port if unused by any service
    public async Task ClosePortIfUnusedAsync(int port, string protocol = "TCP", string? excludeSection = null)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var stillInUse = await db.Settings
            .Where(s => s.IsPortVariable && s.Value == port.ToString()
                && (excludeSection == null || s.Section != excludeSection))
            .AnyAsync();

        if (stillInUse) return;

        var rule = await db.PortAccessRules.FirstOrDefaultAsync(r => r.Port == port && r.Protocol == protocol.ToUpper());
        if (rule != null)
        {
            db.PortAccessRules.Remove(rule);
            await db.SaveChangesAsync();
        }
    }

    public async Task OpenPortAsync(int port, string name, string protocol = "TCP", string? serviceName = null)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        int? serviceId = null;
        if (!string.IsNullOrEmpty(serviceName))
            serviceId = await db.Services
                .Where(s => s.Name == serviceName || s.ComposeName == serviceName)
                .Select(s => (int?)s.Id).FirstOrDefaultAsync();

        var existing = await db.PortAccessRules.FirstOrDefaultAsync(r => r.Port == port && r.Protocol == protocol.ToUpper());
        if (existing == null)
        {
            db.PortAccessRules.Add(new PortAccessRule
            {
                Name = name, Port = port, Protocol = protocol.ToUpper(),
                IsActive = true, IsExternal = false, ServiceId = serviceId
            });
        }
        else
        {
            existing.IsActive = true;
        }

        await db.SaveChangesAsync();
    }
}
