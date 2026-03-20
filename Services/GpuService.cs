using HomeBase.API.Models;
using System.Diagnostics;

namespace HomeBase.API.Services;

public class GpuService
{
    private readonly ILogger<GpuService> _logger;
    private bool? _gpuAvailable;
    private DateTime _lastCheck = DateTime.MinValue;
    private static readonly TimeSpan DetectCooldown = TimeSpan.FromMinutes(5);

    public GpuService(ILogger<GpuService> logger) => _logger = logger;

    public async Task<GpuInfoDto> GetGpuInfoAsync()
    {
        // Check availability with cooldown
        if (_gpuAvailable == false && DateTime.UtcNow - _lastCheck < DetectCooldown)
            return new GpuInfoDto(false, null, []);

        try
        {
            var csv = await RunNvidiaSmiAsync(
                "--query-gpu=index,name,temperature.gpu,utilization.gpu,utilization.memory,memory.used,memory.total,power.draw,driver_version",
                "--format=csv,noheader,nounits"
            );

            if (string.IsNullOrWhiteSpace(csv))
            {
                _gpuAvailable = false;
                _lastCheck = DateTime.UtcNow;
                return new GpuInfoDto(false, null, []);
            }

            _gpuAvailable = true;
            var devices = new List<GpuDeviceDto>();
            string? driverVersion = null;

            foreach (var line in csv.Split('\n', StringSplitOptions.RemoveEmptyEntries))
            {
                var parts = line.Split(',').Select(p => p.Trim()).ToArray();
                if (parts.Length < 9) continue;

                driverVersion ??= parts[8];
                devices.Add(new GpuDeviceDto(
                    int.TryParse(parts[0], out var idx) ? idx : 0,
                    parts[1],
                    parts[2] + "°C",
                    parts[3] + "%",
                    parts[4] + "%",
                    parts[5] + " MiB",
                    parts[6] + " MiB",
                    parts[7] + " W"
                ));
            }

            return new GpuInfoDto(true, driverVersion, devices);
        }
        catch (Exception ex)
        {
            _logger.LogDebug("GPU detection failed: {Message}", ex.Message);
            _gpuAvailable = false;
            _lastCheck = DateTime.UtcNow;
            return new GpuInfoDto(false, null, []);
        }
    }

    private static async Task<string> RunNvidiaSmiAsync(params string[] args)
    {
        var psi = new ProcessStartInfo
        {
            FileName = "nvidia-smi",
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };
        foreach (var a in args) psi.ArgumentList.Add(a);

        using var proc = Process.Start(psi);
        if (proc == null) return "";

        var output = await proc.StandardOutput.ReadToEndAsync();
        await proc.WaitForExitAsync();

        return proc.ExitCode == 0 ? output : "";
    }
}
