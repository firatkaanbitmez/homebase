using HomeBase.API.Models;
using System.Diagnostics;

namespace HomeBase.API.Services;

public class SystemService
{
    public List<DiskDto> GetDisks()
    {
        // In Docker container, read mounted host drives via df
        try
        {
            var psi = new ProcessStartInfo("df", "-B1")
            {
                RedirectStandardOutput = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };
            using var proc = Process.Start(psi)!;
            var output = proc.StandardOutput.ReadToEnd();
            proc.WaitForExit(5000);

            var seen = new HashSet<string>();
            var disks = new List<DiskDto>();

            foreach (var line in output.Split('\n').Skip(1))
            {
                var parts = line.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length < 6) continue;
                var mount = parts[5];
                if (!mount.StartsWith("/hostfs/")) continue;

                var letter = mount.Replace("/hostfs/", "").ToUpper();
                if (!seen.Add(letter)) continue;

                var total = long.TryParse(parts[1], out var t) ? t : 0;
                var used = long.TryParse(parts[2], out var u) ? u : 0;

                disks.Add(new DiskDto(
                    $"{letter}:",
                    (int)(total / 1073741824),
                    (int)(used / 1073741824),
                    total > 0 ? (int)((double)used / total * 100) : 0
                ));
            }
            return disks;
        }
        catch
        {
            // Fallback for running on Windows host directly
            return DriveInfo.GetDrives()
                .Where(d => d.IsReady && d.DriveType == DriveType.Fixed)
                .Select(d =>
                {
                    var total = (int)(d.TotalSize / 1073741824);
                    var used = (int)((d.TotalSize - d.AvailableFreeSpace) / 1073741824);
                    return new DiskDto(d.Name.TrimEnd('\\'), total, used,
                        total > 0 ? (int)((double)used / total * 100) : 0);
                }).ToList();
        }
    }
}
