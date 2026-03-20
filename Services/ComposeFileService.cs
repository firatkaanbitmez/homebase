using HomeBase.API.Models;
using System.Diagnostics;
using System.Text;
using System.Text.RegularExpressions;
using YamlDotNet.Serialization;
using YamlDotNet.Serialization.NamingConventions;

namespace HomeBase.API.Services;

public class ComposeFileService
{
    private readonly IConfiguration _config;
    private readonly ILogger<ComposeFileService> _logger;

    public ComposeFileService(IConfiguration config, ILogger<ComposeFileService> logger)
    {
        _config = config;
        _logger = logger;
    }

    private string ProjectDir => _config["Paths:ProjectDir"] ?? "/app/project";
    public string ServicesDir => Path.Combine(ProjectDir, "services");

    /// Write a per-service docker-compose.yml + .env into services/{slug}/
    public async Task WriteServiceComposeAsync(Service svc, ComposeServiceDefinition def)
    {
        var dir = Path.Combine(ServicesDir, svc.ServiceSlug);
        Directory.CreateDirectory(dir);

        var composePath = Path.Combine(dir, "docker-compose.yml");

        var sb = new StringBuilder();
        sb.AppendLine($"name: hb-{svc.ServiceSlug}");
        sb.AppendLine();
        sb.AppendLine("services:");
        sb.AppendLine($"  {def.ComposeName}:");

        if (!string.IsNullOrEmpty(def.Image))
            sb.AppendLine($"    image: {def.Image}");
        else if (!string.IsNullOrEmpty(def.BuildContext))
        {
            // Build context is relative to project dir, compute relative path from services/{slug}
            var relPath = Path.GetRelativePath(dir, Path.Combine(ProjectDir, def.BuildContext)).Replace('\\', '/');
            sb.AppendLine($"    build: {relPath}");
        }

        var containerName = def.ContainerName ?? svc.ServiceSlug;
        sb.AppendLine($"    container_name: {containerName}");

        sb.AppendLine($"    restart: {def.RestartPolicy ?? "unless-stopped"}");

        if (def.Ports.Count > 0)
        {
            sb.AppendLine("    ports:");
            foreach (var port in def.Ports)
                sb.AppendLine($"      - \"{port}\"");
        }

        if (def.Environment.Count > 0)
        {
            sb.AppendLine("    environment:");
            foreach (var (key, val) in def.Environment)
                sb.AppendLine($"      {key}: \"{val}\"");
        }

        if (def.Volumes.Count > 0)
        {
            sb.AppendLine("    volumes:");
            foreach (var vol in def.Volumes)
            {
                // Adjust relative volume paths from project root to services/{slug}
                var adjustedVol = AdjustVolumePath(vol, dir);
                sb.AppendLine($"      - {adjustedVol}");
            }
        }

        if (def.DependsOn.Count > 0)
        {
            sb.AppendLine("    depends_on:");
            foreach (var dep in def.DependsOn)
                sb.AppendLine($"      - {dep}");
        }

        if (!string.IsNullOrEmpty(def.Command))
            sb.AppendLine($"    command: {def.Command}");

        sb.AppendLine("    networks:");
        sb.AppendLine("      - homebase");

        sb.AppendLine();
        sb.AppendLine("networks:");
        sb.AppendLine("  homebase:");
        sb.AppendLine("    external: true");

        await File.WriteAllTextAsync(composePath, sb.ToString());
        _logger.LogInformation("Wrote per-service compose: {Path}", composePath);
    }

    /// Delete a service's directory entirely
    public Task DeleteServiceDirectoryAsync(string slug)
    {
        var dir = Path.Combine(ServicesDir, slug);
        if (Directory.Exists(dir))
        {
            Directory.Delete(dir, true);
            _logger.LogInformation("Deleted service directory: {Dir}", dir);
        }
        return Task.CompletedTask;
    }

    /// List all service slugs (directory names under services/)
    public List<string> ListServiceSlugs()
    {
        if (!Directory.Exists(ServicesDir))
            return new List<string>();

        return Directory.GetDirectories(ServicesDir)
            .Select(Path.GetFileName)
            .Where(n => !string.IsNullOrEmpty(n))
            .ToList()!;
    }

    /// Generate a unique slug from a base name
    public string GenerateUniqueSlug(string baseName)
    {
        var slug = Regex.Replace(baseName.ToLowerInvariant(), @"[^a-z0-9]+", "-").Trim('-');
        if (string.IsNullOrEmpty(slug)) slug = "service";

        var dir = Path.Combine(ServicesDir, slug);
        if (!Directory.Exists(dir))
            return slug;

        // Append short GUID suffix
        for (int i = 0; i < 10; i++)
        {
            var candidate = $"{slug}-{Guid.NewGuid().ToString("N")[..4]}";
            if (!Directory.Exists(Path.Combine(ServicesDir, candidate)))
                return candidate;
        }

        return $"{slug}-{Guid.NewGuid().ToString("N")[..8]}";
    }

    /// Ensure the shared homebase network exists
    public void EnsureNetwork()
    {
        try
        {
            var shell = OperatingSystem.IsWindows() ? "cmd.exe" : "/bin/sh";
            var cmd = "docker network create homebase 2>/dev/null || true";
            var args = OperatingSystem.IsWindows() ? $"/c {cmd}" : $"-c \"{cmd}\"";
            var psi = new ProcessStartInfo(shell, args)
            {
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };
            using var proc = Process.Start(psi)!;
            proc.WaitForExit(10000);
            _logger.LogInformation("Ensured homebase network exists");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to create homebase network");
        }
    }

    /// Get compose file path for a service slug
    public string GetComposeFilePath(string slug)
    {
        return Path.Combine(ServicesDir, slug, "docker-compose.yml");
    }

    /// Get the relative compose file path (for DB storage)
    public string GetRelativeComposeFilePath(string slug)
    {
        return $"services/{slug}/docker-compose.yml";
    }

    /// Adjust volume paths that are relative to project root to be relative to services/{slug}
    private string AdjustVolumePath(string vol, string serviceDir)
    {
        // Only adjust host:container style volumes where host starts with ./
        var colonIdx = vol.IndexOf(':');
        if (colonIdx <= 0) return vol;

        var hostPart = vol[..colonIdx];
        var rest = vol[colonIdx..];

        if (hostPart.StartsWith("./") || hostPart.StartsWith("../"))
        {
            var absPath = Path.GetFullPath(Path.Combine(ProjectDir, hostPart));
            var relPath = Path.GetRelativePath(serviceDir, absPath).Replace('\\', '/');
            return relPath + rest;
        }

        return vol;
    }
}
