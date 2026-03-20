using Docker.DotNet;
using Docker.DotNet.Models;
using HomeBase.API.Data;
using HomeBase.API.Models;
using Microsoft.EntityFrameworkCore;
using System.Diagnostics;

namespace HomeBase.API.Services;

public class DockerService
{
    private readonly DockerClient _client;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly FirewallService _firewall;
    private readonly ComposeFileService _composeFile;
    private readonly IConfiguration _config;
    private readonly ILogger<DockerService> _logger;
    private static readonly string[] ProtectedContainers = ["homebase-api", "homebase-db"];

    public DockerService(IServiceScopeFactory scopeFactory, FirewallService firewall,
        ComposeFileService composeFile, IConfiguration config, ILogger<DockerService> logger)
    {
        var dockerUri = OperatingSystem.IsWindows()
            ? new Uri("npipe://./pipe/docker_engine")
            : new Uri("unix:///var/run/docker.sock");
        _client = new DockerClientConfiguration(dockerUri).CreateClient();
        _scopeFactory = scopeFactory;
        _firewall = firewall;
        _composeFile = composeFile;
        _config = config;
        _logger = logger;
    }

    private string ProjectDir => _config["Paths:ProjectDir"] ?? "/app/project";

    public bool IsProtected(string name) => ProtectedContainers.Contains(name);

    public async Task<List<ContainerDto>> GetContainersAsync()
    {
        var containers = await _client.Containers.ListContainersAsync(new ContainersListParameters { All = true });

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var disabledList = await db.ContainerStates.Where(s => s.IsDisabled).Select(s => s.ContainerName).ToListAsync();

        var tasks = containers.Select(async c =>
        {
            var name = c.Names[0].TrimStart('/');
            ContainerStatsDto? stats = null;

            if (c.State == "running")
            {
                try
                {
                    var cts = new CancellationTokenSource(TimeSpan.FromSeconds(3));
                    stats = await GetStatsAsync(c.ID, cts.Token);
                }
                catch { stats = new ContainerStatsDto("0", "0", "0", 0, 0); }
            }

            var ports = c.Ports?
                .Where(p => p.PublicPort > 0)
                .Select(p => new PortDto((int)p.PublicPort, (int)p.PrivatePort))
                .Distinct()
                .ToList() ?? [];

            return new ContainerDto(
                c.ID[..12], name, c.Image, c.State, c.Status,
                ports, stats, null, IsProtected(name), disabledList.Contains(name)
            );
        });

        return (await Task.WhenAll(tasks)).ToList();
    }

    private async Task<ContainerStatsDto?> GetStatsAsync(string id, CancellationToken token = default)
    {
        try
        {
#pragma warning disable CS0618
            var response = await _client.Containers.GetContainerStatsAsync(id,
                new ContainerStatsParameters { Stream = false }, token);
#pragma warning restore CS0618

            using var reader = new StreamReader(response);
            var json = await reader.ReadToEndAsync();
            var stats = System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement>(json);

            var cpuDelta = stats.GetProperty("cpu_stats").GetProperty("cpu_usage").GetProperty("total_usage").GetInt64()
                         - stats.GetProperty("precpu_stats").GetProperty("cpu_usage").GetProperty("total_usage").GetInt64();
            var sysDelta = stats.GetProperty("cpu_stats").GetProperty("system_cpu_usage").GetInt64()
                         - stats.GetProperty("precpu_stats").GetProperty("system_cpu_usage").GetInt64();
            var cpuCount = stats.GetProperty("cpu_stats").TryGetProperty("online_cpus", out var oc) ? oc.GetInt32() : 1;
            var cpuPct = sysDelta > 0 ? Math.Round((double)cpuDelta / sysDelta * cpuCount * 100, 1) : 0;

            var memUsage = stats.GetProperty("memory_stats").GetProperty("usage").GetInt64();
            var memLimit = stats.GetProperty("memory_stats").GetProperty("limit").GetInt64();
            var memPct = Math.Round((double)memUsage / memLimit * 100, 1);
            var memMB = memUsage / 1024 / 1024;

            long rx = 0, tx = 0;
            if (stats.TryGetProperty("networks", out var nets))
            {
                foreach (var iface in nets.EnumerateObject())
                {
                    rx += iface.Value.GetProperty("rx_bytes").GetInt64();
                    tx += iface.Value.GetProperty("tx_bytes").GetInt64();
                }
            }

            long blockRead = 0, blockWrite = 0;
            if (stats.TryGetProperty("blkio_stats", out var blkio) &&
                blkio.TryGetProperty("io_service_bytes_recursive", out var ioBytes) &&
                ioBytes.ValueKind == System.Text.Json.JsonValueKind.Array)
            {
                foreach (var entry in ioBytes.EnumerateArray())
                {
                    var op = entry.GetProperty("op").GetString()?.ToLower();
                    var val = entry.GetProperty("value").GetInt64();
                    if (op == "read") blockRead += val;
                    else if (op == "write") blockWrite += val;
                }
            }

            int pidCount = 0;
            if (stats.TryGetProperty("pids_stats", out var pids) &&
                pids.TryGetProperty("current", out var pidCurrent))
            {
                pidCount = pidCurrent.GetInt32();
            }

            return new ContainerStatsDto(cpuPct.ToString("F1"), memPct.ToString("F1"), memMB.ToString(), rx, tx, blockRead, blockWrite, pidCount);
        }
        catch
        {
            return new ContainerStatsDto("0", "0", "0", 0, 0, 0, 0, 0);
        }
    }

    /// Start a container. If the container doesn't exist (was removed),
    /// falls back to per-service compose to recreate it.
    public async Task StartContainerAsync(string name)
    {
        await SetDisabledAsync(name, false);

        var container = await FindContainerAsync(name);

        if (container == null)
        {
            _logger.LogInformation("Container '{Name}' not found, recreating via compose", name);
            var svc = await ResolveServiceAsync(name);
            if (svc?.ComposeFilePath != null)
            {
                var composePath = Path.Combine(ProjectDir, svc.ComposeFilePath);
                var (ok, err) = RunShell($"docker compose -f \"{composePath}\" up -d", 60000);
                if (!ok) throw new Exception($"Container '{name}' bulunamadi ve yeniden olusturulamadi: {err}");
            }
            else
            {
                // Fallback to legacy root compose
                var composeName = svc?.ComposeName ?? name;
                var (ok, err) = RunShell($"cd \"{ProjectDir}\" && docker compose up -d {composeName}", 60000);
                if (!ok) throw new Exception($"Container '{name}' bulunamadi ve yeniden olusturulamadi: {err}");
            }

            await LogAsync("start", name, "Recreated via compose");
            return;
        }

        var state = container.State;
        if (state == "running")
        {
            _logger.LogInformation("Container '{Name}' is already running", name);
            return;
        }

        try
        {
            await _client.Containers.StartContainerAsync(container.ID, new ContainerStartParameters());
            await LogAsync("start", name);
        }
        catch (DockerApiException ex)
        {
            _logger.LogWarning(ex, "docker start failed for '{Name}', trying compose recreate", name);

            var svc = await ResolveServiceAsync(name);

            try
            {
                await _client.Containers.RemoveContainerAsync(container.ID,
                    new ContainerRemoveParameters { Force = true });
            }
            catch { }

            if (svc?.ComposeFilePath != null)
            {
                var composePath = Path.Combine(ProjectDir, svc.ComposeFilePath);
                var (ok, err) = RunShell($"docker compose -f \"{composePath}\" up -d", 60000);
                if (!ok)
                {
                    var msg = ex.Message;
                    if (msg.Contains("port is already allocated") || msg.Contains("address already in use"))
                        throw new Exception($"Port cakismasi: Baska bir servis ayni portu kullaniyor. Portu degistirin veya cakisan servisi durdurun.");
                    throw new Exception($"Container baslatilamadi: {msg}");
                }
            }
            else
            {
                var target = svc?.ComposeName ?? name;
                var (ok, err) = RunShell($"cd \"{ProjectDir}\" && docker compose up -d {target}", 60000);
                if (!ok)
                {
                    var msg = ex.Message;
                    if (msg.Contains("port is already allocated") || msg.Contains("address already in use"))
                        throw new Exception($"Port cakismasi: Baska bir servis ayni portu kullaniyor. Portu degistirin veya cakisan servisi durdurun.");
                    throw new Exception($"Container baslatilamadi: {msg}");
                }
            }

            await LogAsync("start", name, "Recreated via compose (start failed)");
        }

        await OpenFirewallPortsForContainerAsync(name);
    }

    public async Task<bool> RemoveContainerAsync(string name)
    {
        if (IsProtected(name)) throw new Exception("Protected container cannot be removed");

        var container = await FindContainerAsync(name);
        if (container == null)
        {
            _logger.LogWarning("Container '{Name}' not found for removal", name);
            return false;
        }

        try
        {
            if (container.State == "running")
            {
                await _client.Containers.StopContainerAsync(container.ID,
                    new ContainerStopParameters { WaitBeforeKillSeconds = 10 });
            }
            await _client.Containers.RemoveContainerAsync(container.ID,
                new ContainerRemoveParameters { Force = true, RemoveVolumes = false });
            await LogAsync("container_remove", name);
        }
        catch (DockerApiException ex)
        {
            _logger.LogWarning(ex, "Failed to remove container '{Name}'", name);
            try
            {
                await _client.Containers.RemoveContainerAsync(container.ID,
                    new ContainerRemoveParameters { Force = true });
            }
            catch { }
        }

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var state = await db.ContainerStates.FirstOrDefaultAsync(s => s.ContainerName == name);
        if (state != null) { db.ContainerStates.Remove(state); await db.SaveChangesAsync(); }

        return true;
    }

    public async Task StopContainerAsync(string name)
    {
        if (IsProtected(name)) throw new Exception("Protected container");

        var container = await FindContainerAsync(name);
        if (container == null)
        {
            await SetDisabledAsync(name, true);
            _logger.LogWarning("Container '{Name}' not found for stop, marking as disabled", name);
            return;
        }

        if (container.State != "running")
        {
            await SetDisabledAsync(name, true);
            return;
        }

        try
        {
            await _client.Containers.StopContainerAsync(container.ID,
                new ContainerStopParameters { WaitBeforeKillSeconds = 10 });
        }
        catch (DockerApiException ex) when (ex.Message.Contains("is not running"))
        {
            _logger.LogInformation("Container '{Name}' already stopped", name);
        }

        await SetDisabledAsync(name, true);
        await LogAsync("stop", name);
        await CloseFirewallPortsForContainerAsync(name);
    }

    public async Task RestartContainerAsync(string name)
    {
        var container = await FindContainerAsync(name);

        if (container == null)
        {
            _logger.LogInformation("Container '{Name}' not found for restart, recreating via compose", name);
            await SetDisabledAsync(name, false);
            var svc = await ResolveServiceAsync(name);

            if (svc?.ComposeFilePath != null)
            {
                var composePath = Path.Combine(ProjectDir, svc.ComposeFilePath);
                var (ok, err) = RunShell($"docker compose -f \"{composePath}\" up -d", 60000);
                if (!ok) throw new Exception($"Container yeniden olusturulamadi: {err}");
            }
            else
            {
                var target = svc?.ComposeName ?? name;
                var (ok, err) = RunShell($"cd \"{ProjectDir}\" && docker compose up -d {target}", 60000);
                if (!ok) throw new Exception($"Container yeniden olusturulamadi: {err}");
            }
            await LogAsync("restart", name, "Recreated via compose");
            return;
        }

        try
        {
            await _client.Containers.RestartContainerAsync(container.ID, new ContainerRestartParameters());
            await SetDisabledAsync(name, false);
            await LogAsync("restart", name);
        }
        catch (DockerApiException ex)
        {
            _logger.LogWarning(ex, "docker restart failed for '{Name}', trying compose recreate", name);
            await SetDisabledAsync(name, false);
            var svc = await ResolveServiceAsync(name);

            try { await _client.Containers.RemoveContainerAsync(container.ID, new ContainerRemoveParameters { Force = true }); }
            catch { }

            if (svc?.ComposeFilePath != null)
            {
                var composePath = Path.Combine(ProjectDir, svc.ComposeFilePath);
                var (ok, err) = RunShell($"docker compose -f \"{composePath}\" up -d", 60000);
                if (!ok) throw new Exception($"Container yeniden baslatilamadi: {err}");
            }
            else
            {
                var target = svc?.ComposeName ?? name;
                var (ok, err) = RunShell($"cd \"{ProjectDir}\" && docker compose up -d {target}", 60000);
                if (!ok) throw new Exception($"Container yeniden baslatilamadi: {err}");
            }
            await LogAsync("restart", name, "Recreated via compose");
        }
    }

    /// Recreate a service via its per-service compose file
    public Task RecreateViaComposeAsync(Service svc)
    {
        if (svc.ComposeFilePath != null)
        {
            var composePath = Path.Combine(ProjectDir, svc.ComposeFilePath);
            var containerName = svc.ContainerName;
            RunShell($"docker stop {containerName} 2>/dev/null; docker rm -f {containerName} 2>/dev/null", 15000);
            var (ok, err) = RunShell($"docker compose -f \"{composePath}\" up -d", 60000);
            if (!ok) _logger.LogWarning("Recreate failed for {Service}: {Error}", svc.ServiceSlug, err);
            else _logger.LogInformation("Recreated service via compose: {Service}", svc.ServiceSlug);
        }
        else
        {
            var target = svc.ComposeName ?? svc.ContainerName;
            RunShell($"docker stop {target} 2>/dev/null; docker rm -f {target} 2>/dev/null", 15000);
            RunShell($"cd \"{ProjectDir}\" && docker compose up -d {target}", 60000);
        }
        return Task.CompletedTask;
    }

    public async Task<string> GetContainerLogsAsync(string name, int lines = 200, bool timestamps = true)
    {
        var container = await FindContainerAsync(name);
        if (container == null) throw new Exception($"Container '{name}' not found");

        var parameters = new ContainerLogsParameters
        {
            ShowStdout = true,
            ShowStderr = true,
            Timestamps = timestamps,
            Tail = lines.ToString()
        };

        using var muxStream = await _client.Containers.GetContainerLogsAsync(container.ID, false, parameters);
        var output = new System.Text.StringBuilder();
        var buffer = new byte[8192];

        while (true)
        {
            var result = await muxStream.ReadOutputAsync(buffer, 0, buffer.Length, default);
            if (result.EOF) break;
            if (result.Count > 0)
                output.Append(System.Text.Encoding.UTF8.GetString(buffer, 0, result.Count));
        }

        return output.ToString();
    }

    public async Task<ContainerInspectDto?> InspectContainerAsync(string name)
    {
        var container = await FindContainerAsync(name);
        if (container == null) return null;

        var inspect = await _client.Containers.InspectContainerAsync(container.ID);
        var mounts = inspect.Mounts?.Select(m => new MountDto(
            m.Type, m.Source, m.Destination, m.RW == false
        )).ToList() ?? [];

        var env = inspect.Config?.Env?.ToList() ?? [];

        string? healthStatus = null;
        if (inspect.State?.Health != null)
            healthStatus = inspect.State.Health.Status;

        long memLimit = inspect.HostConfig?.Memory ?? 0;
        double cpuLimit = 0;
        if (inspect.HostConfig != null)
        {
            if (inspect.HostConfig.NanoCPUs > 0)
                cpuLimit = inspect.HostConfig.NanoCPUs / 1_000_000_000.0;
            else if (inspect.HostConfig.CPUQuota > 0 && inspect.HostConfig.CPUPeriod > 0)
                cpuLimit = (double)inspect.HostConfig.CPUQuota / inspect.HostConfig.CPUPeriod;
        }

        var restartPolicy = inspect.HostConfig?.RestartPolicy?.Name.ToString() ?? "";
        var restartMax = (int)(inspect.HostConfig?.RestartPolicy?.MaximumRetryCount ?? 0);

        long sizeRw = 0, sizeRootFs = 0;
        try
        {
            var sizeContainers = await _client.Containers.ListContainersAsync(
                new ContainersListParameters { All = true, Size = true });
            var match = sizeContainers.FirstOrDefault(c => c.Names.Any(n => n.TrimStart('/') == name));
            if (match != null)
            {
                sizeRw = match.SizeRw;
                sizeRootFs = match.SizeRootFs;
            }
        }
        catch { }

        var networks = new List<ContainerNetworkDto>();
        if (inspect.NetworkSettings?.Networks != null)
        {
            foreach (var (netName, netSettings) in inspect.NetworkSettings.Networks)
            {
                networks.Add(new ContainerNetworkDto(
                    netName,
                    netSettings.IPAddress ?? "",
                    netSettings.Gateway ?? "",
                    (int)netSettings.IPPrefixLen
                ));
            }
        }

        return new ContainerInspectDto(
            inspect.ID[..12],
            inspect.Name.TrimStart('/'),
            inspect.Config?.Image ?? "",
            inspect.Image?[..12] ?? "",
            inspect.Created,
            (int)inspect.RestartCount,
            mounts,
            env,
            healthStatus,
            memLimit,
            cpuLimit,
            restartPolicy,
            restartMax,
            sizeRw,
            sizeRootFs,
            networks
        );
    }

    /// Open firewall ports for a container based on its service's settings in DB
    private async Task OpenFirewallPortsForContainerAsync(string containerName)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

            var svc = await db.Services.FirstOrDefaultAsync(s => s.ContainerName == containerName);
            if (svc == null) return;

            var portSettings = await db.Settings
                .Where(s => s.IsPortVariable && (s.ServiceId == svc.Id || s.Section == svc.Name))
                .ToListAsync();

            foreach (var ps in portSettings)
            {
                if (int.TryParse(ps.Value, out var port) && port > 0)
                {
                    await _firewall.OpenPortAsync(port, $"SVC-{port}", "TCP", svc.Name);
                    _logger.LogInformation("Start: opened firewall port {Port} for {Container}", port, containerName);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to open firewall ports for {Container}", containerName);
        }
    }

    /// Close firewall ports for a container based on its service's settings in DB
    private async Task CloseFirewallPortsForContainerAsync(string containerName)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

            var svc = await db.Services.FirstOrDefaultAsync(s => s.ContainerName == containerName);
            if (svc == null) return;

            var portSettings = await db.Settings
                .Where(s => s.IsPortVariable && (s.ServiceId == svc.Id || s.Section == svc.Name))
                .ToListAsync();

            foreach (var ps in portSettings)
            {
                if (int.TryParse(ps.Value, out var port) && port > 0)
                {
                    await _firewall.ClosePortIfUnusedAsync(port, "TCP");
                    _logger.LogInformation("Stop: closed firewall port {Port} for {Container}", port, containerName);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to close firewall ports for {Container}", containerName);
        }
    }

    private async Task<ContainerListResponse?> FindContainerAsync(string name)
    {
        var containers = await _client.Containers.ListContainersAsync(new ContainersListParameters { All = true });
        return containers.FirstOrDefault(c => c.Names.Any(n => n.TrimStart('/') == name));
    }

    /// Resolve full Service object from container name via DB
    public async Task<Service?> ResolveServiceAsync(string containerName)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return await db.Services.FirstOrDefaultAsync(s => s.ContainerName == containerName);
    }

    private async Task SetDisabledAsync(string name, bool disabled)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var state = await db.ContainerStates.FirstOrDefaultAsync(s => s.ContainerName == name);
        if (state == null)
        {
            state = new Models.ContainerState { ContainerName = name, IsDisabled = disabled };
            db.ContainerStates.Add(state);
        }
        else
        {
            state.IsDisabled = disabled;
            state.UpdatedAt = DateTime.UtcNow;
        }
        await db.SaveChangesAsync();
    }

    private async Task LogAsync(string action, string target, string? details = null)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.AuditLogs.Add(new AuditLog { Action = action, Target = target, Details = details });
        await db.SaveChangesAsync();
    }

    public (bool ok, string? error) RunShell(string command, int timeoutMs)
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
        var stderr = proc.StandardError.ReadToEnd();
        proc.WaitForExit(timeoutMs);
        var ok = proc.ExitCode == 0;
        if (!ok) _logger.LogWarning("Shell command failed: {Cmd} → {Err}", command, stderr);
        return (ok, ok ? null : stderr);
    }
}
