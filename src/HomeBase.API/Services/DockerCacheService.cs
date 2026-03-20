using Docker.DotNet;
using Docker.DotNet.Models;
using HomeBase.API.Data;
using HomeBase.API.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using System.Text.Json;

namespace HomeBase.API.Services;

public class DockerCacheService : BackgroundService
{
    private readonly DockerClient _client;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IMemoryCache _cache;
    private readonly ILogger<DockerCacheService> _logger;
    private const string CacheKey = "containers_cache";
    private const int PollIntervalMs = 3000;
    private const int CacheTtlSeconds = 5;

    private List<ContainerDto> _previousState = new();
    private bool _hasChanges;
    private readonly SemaphoreSlim _lock = new(1, 1);

    // Event for SignalR broadcast
    public event Func<List<ContainerDto>, Task>? OnContainersChanged;
    public event Func<List<ContainerDto>, Task>? OnStatsUpdated;

    private int _statsBroadcastCounter;

    public DockerCacheService(
        IServiceScopeFactory scopeFactory,
        IMemoryCache cache,
        ILogger<DockerCacheService> logger,
        IConfiguration config)
    {
        _scopeFactory = scopeFactory;
        _cache = cache;
        _logger = logger;

        var dockerUri = OperatingSystem.IsWindows()
            ? new Uri("npipe://./pipe/docker_engine")
            : new Uri("unix:///var/run/docker.sock");
        _client = new DockerClientConfiguration(dockerUri).CreateClient();
    }

    public bool HasChanges => _hasChanges;

    public List<ContainerDto> GetPreviousState() => _previousState;

    public async Task<List<ContainerDto>> GetCachedContainersAsync()
    {
        if (_cache.TryGetValue<List<ContainerDto>>(CacheKey, out var cached) && cached != null)
            return cached;

        // Cache miss — do a fresh fetch
        return await FetchAndCacheAsync();
    }

    /// Force an immediate refresh of the cache (used after container actions)
    public async Task InvalidateAndRefreshAsync()
    {
        _cache.Remove(CacheKey);
        var containers = await FetchAndCacheAsync();
        _hasChanges = true;
        if (OnContainersChanged != null)
            await OnContainersChanged.Invoke(containers);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("DockerCacheService started (poll interval: {Ms}ms)", PollIntervalMs);

        // Initial fetch
        await FetchAndCacheAsync();

        while (!stoppingToken.IsCancellationRequested)
        {
            await Task.Delay(PollIntervalMs, stoppingToken);

            try
            {
                var containers = await FetchAndCacheAsync();
                var changed = DetectChanges(containers);
                _hasChanges = changed;

                _statsBroadcastCounter++;

                if (changed && OnContainersChanged != null)
                {
                    await OnContainersChanged.Invoke(containers);
                }
                else if (_statsBroadcastCounter % 2 == 0 && OnStatsUpdated != null)
                {
                    // Stats-only push every ~6s (every 2nd cycle)
                    await OnStatsUpdated.Invoke(containers);
                }

                _previousState = containers;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "DockerCacheService poll cycle failed");
            }
        }
    }

    private async Task<List<ContainerDto>> FetchAndCacheAsync()
    {
        await _lock.WaitAsync();
        try
        {
            var containers = await _client.Containers.ListContainersAsync(
                new ContainersListParameters { All = true });

            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var disabledList = await db.ContainerStates
                .Where(s => s.IsDisabled)
                .Select(s => s.ContainerName)
                .ToListAsync();

            var protectedNames = new HashSet<string> { "homebase-api", "homebase-db" };

            // Parallel stats fetch for running containers
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
                    .Select(p => new PortDto((int)p.PublicPort, (int)p.PrivatePort, p.IP))
                    .Distinct()
                    .ToList() ?? [];

                return new ContainerDto(
                    c.ID[..12], name, c.Image, c.State, c.Status,
                    ports, stats, null, protectedNames.Contains(name), disabledList.Contains(name)
                );
            });

            var result = (await Task.WhenAll(tasks)).ToList();

            _cache.Set(CacheKey, result, TimeSpan.FromSeconds(CacheTtlSeconds));
            return result;
        }
        finally
        {
            _lock.Release();
        }
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
            var stats = JsonSerializer.Deserialize<JsonElement>(json);

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
                ioBytes.ValueKind == JsonValueKind.Array)
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

    private bool DetectChanges(List<ContainerDto> current)
    {
        if (current.Count != _previousState.Count) return true;

        var prevMap = _previousState.ToDictionary(c => c.Name);
        foreach (var c in current)
        {
            if (!prevMap.TryGetValue(c.Name, out var prev)) return true;
            if (c.State != prev.State) return true;
            if (c.Status != prev.Status) return true;
            if (c.Ports.Count != prev.Ports.Count) return true;
            if (c.UserDisabled != prev.UserDisabled) return true;
        }

        return false;
    }
}
