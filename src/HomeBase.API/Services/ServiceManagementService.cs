using HomeBase.API.Data;
using HomeBase.API.Models;
using Microsoft.EntityFrameworkCore;

namespace HomeBase.API.Services;

public class ServiceManagementService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ComposeParserService _composeParser;
    private readonly ComposeFileService _composeFile;
    private readonly SettingsService _settingsService;
    private readonly DockerService _docker;
    private readonly PortAccessService _portAccess;
    private readonly ILogger<ServiceManagementService> _logger;

    public ServiceManagementService(
        IServiceScopeFactory scopeFactory,
        ComposeParserService composeParser,
        ComposeFileService composeFile,
        SettingsService settingsService,
        DockerService docker,
        PortAccessService portAccess,
        ILogger<ServiceManagementService> logger)
    {
        _scopeFactory = scopeFactory;
        _composeParser = composeParser;
        _composeFile = composeFile;
        _settingsService = settingsService;
        _docker = docker;
        _portAccess = portAccess;
        _logger = logger;
    }

    public async Task<List<Service>> GetAllAsync()
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return await db.Services.Include(s => s.Category).OrderBy(s => s.SortOrder).ToListAsync();
    }

    public async Task<Service?> GetByIdAsync(int id)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return await db.Services.Include(s => s.Category).FirstOrDefaultAsync(s => s.Id == id);
    }

    public async Task<Service> CreateAsync(Service svc)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        // Ensure ServiceSlug is set
        if (string.IsNullOrEmpty(svc.ServiceSlug))
            svc.ServiceSlug = _composeFile.GenerateUniqueSlug(svc.ComposeName ?? svc.ContainerName);

        svc.CreatedAt = DateTime.UtcNow;
        svc.UpdatedAt = DateTime.UtcNow;
        db.Services.Add(svc);
        db.AuditLogs.Add(new AuditLog { Action = "service_create", Target = svc.ContainerName, Details = svc.Name });
        await db.SaveChangesAsync();
        return svc;
    }

    public async Task<Service?> UpdateAsync(int id, Service updated)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var svc = await db.Services.FindAsync(id);
        if (svc == null) return null;

        svc.Name = updated.Name;
        svc.Description = updated.Description;
        svc.Icon = updated.Icon;
        svc.Color = updated.Color;
        svc.ContainerName = updated.ContainerName;
        svc.PreferPort = updated.PreferPort;
        svc.UrlPath = updated.UrlPath;
        svc.IsEnabled = updated.IsEnabled;
        svc.SortOrder = updated.SortOrder;
        svc.ComposeName = updated.ComposeName ?? svc.ComposeName;
        svc.Image = updated.Image ?? svc.Image;
        svc.CategoryId = updated.CategoryId ?? svc.CategoryId;
        svc.UpdatedAt = DateTime.UtcNow;

        db.AuditLogs.Add(new AuditLog { Action = "service_update", Target = svc.ContainerName, Details = svc.Name });
        await db.SaveChangesAsync();
        return svc;
    }

    public async Task<DeleteResult> DeleteServiceAsync(int id)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var svc = await db.Services.FindAsync(id);
        if (svc == null) return new DeleteResult(false, "Service not found");

        if (_docker.IsProtected(svc.ContainerName))
            return new DeleteResult(false, "Protected service cannot be deleted");

        var warnings = new List<string>();
        var composeName = svc.ComposeName ?? svc.ContainerName;
        var sectionName = svc.Name;

        // 0. Collect port settings before deletion
        var portValues = new List<int>();
        try
        {
            var portSettings = await db.Settings
                .Where(s => s.ServiceId == svc.Id || s.Section == sectionName)
                .Where(s => s.IsPortVariable)
                .ToListAsync();
            foreach (var ps in portSettings)
            {
                if (int.TryParse(ps.Value, out var port))
                    portValues.Add(port);
            }
        }
        catch { }

        // 1. Container stop + remove
        try { await _docker.RemoveContainerAsync(svc.ContainerName); }
        catch (Exception ex) { warnings.Add($"Container: {ex.Message}"); }

        // 2. Delete per-service directory if it exists
        if (!string.IsNullOrEmpty(svc.ServiceSlug))
        {
            try { await _composeFile.DeleteServiceDirectoryAsync(svc.ServiceSlug); }
            catch (Exception ex) { warnings.Add($"ServiceDir: {ex.Message}"); }
        }


        // 3. Settings + env file cleanup
        try
        {
            if (svc.Id > 0)
                await _settingsService.DeleteSettingsForServiceAsync(svc.Id);
            await _settingsService.DeleteSettingsForServiceAsync(composeName, sectionName);
        }
        catch (Exception ex) { warnings.Add($"Settings: {ex.Message}"); }

        // 4. Port access cleanup
        try
        {
            foreach (var port in portValues)
                await _portAccess.ClosePortIfUnusedAsync(port, "TCP", excludeSection: null);
        }
        catch (Exception ex) { warnings.Add($"Port access: {ex.Message}"); }

        // 5. DB record removal
        try
        {
            var svcToDelete = await db.Services.FindAsync(id);
            if (svcToDelete != null)
            {
                db.Services.Remove(svcToDelete);
                db.AuditLogs.Add(new AuditLog
                {
                    Action = "service_delete",
                    Target = svc.ContainerName,
                    Details = $"Full delete: {svc.Name} (slug: {svc.ServiceSlug})"
                });
                await db.SaveChangesAsync();
            }
        }
        catch (Exception ex) { warnings.Add($"DB: {ex.Message}"); }

        _logger.LogInformation("Deleted service {Name} ({Slug}) with {Warnings} warnings",
            svc.Name, svc.ServiceSlug, warnings.Count);

        return new DeleteResult(true, null, warnings);
    }

    /// Sync compose definitions to database — scans both root infra + per-service dirs
    public async Task<SyncResult> SyncComposeToDbAsync()
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        int created = 0, updated = 0, orphaned = 0;

        // 1. Scan per-service compose files from services/*/
        var slugs = _composeFile.ListServiceSlugs();
        var knownSlugs = new HashSet<string>();

        foreach (var slug in slugs)
        {
            var def = _composeParser.ParseBySlug(slug);
            if (def == null) continue;

            knownSlugs.Add(slug);
            var containerName = def.ContainerName ?? def.ComposeName;

            var existing = await db.Services.FirstOrDefaultAsync(s =>
                s.ServiceSlug == slug || s.ComposeName == def.ComposeName || s.ContainerName == containerName);

            if (existing == null)
            {
                var svc = new Service
                {
                    Name = FormatServiceName(def.ComposeName),
                    Description = "Auto-discovered from per-service compose",
                    Icon = $"/icons/{def.ComposeName}.png",
                    Color = GenerateColor(def.ComposeName),
                    ContainerName = containerName,
                    ServiceSlug = slug,
                    ComposeFilePath = _composeFile.GetRelativeComposeFilePath(slug),
                    ComposeName = def.ComposeName,
                    Image = def.Image,
                    BuildContext = def.BuildContext,
                    EnvFile = def.EnvFiles.FirstOrDefault(),
                    IsAutoDiscovered = true,
                    IsEnabled = true,
                    SortOrder = await db.Services.CountAsync() + 1,
                };
                db.Services.Add(svc);
                db.AuditLogs.Add(new AuditLog
                {
                    Action = "service_auto_discover",
                    Target = containerName,
                    Details = $"Auto-discovered from services/{slug}/"
                });
                created++;
            }
            else
            {
                // Update compose metadata — only set slug if not already taken
                if (existing.ServiceSlug != slug)
                {
                    var slugConflict = await db.Services.AnyAsync(s => s.ServiceSlug == slug && s.Id != existing.Id);
                    if (!slugConflict)
                    {
                        existing.ServiceSlug = slug;
                        existing.ComposeFilePath = _composeFile.GetRelativeComposeFilePath(slug);
                    }
                }
                existing.Image = def.Image ?? existing.Image;
                existing.BuildContext = def.BuildContext ?? existing.BuildContext;
                existing.EnvFile = def.EnvFiles.FirstOrDefault() ?? existing.EnvFile;
                existing.UpdatedAt = DateTime.UtcNow;
                updated++;
            }
        }

        // 2. Also scan root compose (for infra services still there — postgres, dashboard, etc.)
        var infraDefs = _composeParser.ParseInfra();
        var infraNames = infraDefs.Select(d => d.ComposeName).ToHashSet();

        foreach (var def in infraDefs)
        {
            var containerName = def.ContainerName ?? def.ComposeName;
            // Check both DB and pending local adds (to avoid duplicate slugs)
            var existing = await db.Services.FirstOrDefaultAsync(s =>
                s.ComposeName == def.ComposeName || s.ContainerName == containerName);
            if (existing == null)
                existing = db.ChangeTracker.Entries<Service>()
                    .Select(e => e.Entity)
                    .FirstOrDefault(s => s.ComposeName == def.ComposeName || s.ContainerName == containerName);

            if (existing == null)
            {
                // Also skip if slug already taken by a pending add
                var slug = _composeFile.GenerateUniqueSlug(def.ComposeName);
                var slugTaken = db.ChangeTracker.Entries<Service>()
                    .Any(e => e.Entity.ServiceSlug == slug);
                if (slugTaken) continue;

                var svc = new Service
                {
                    Name = FormatServiceName(def.ComposeName),
                    Description = "Auto-discovered from docker-compose.yml",
                    Icon = $"/icons/{def.ComposeName}.png",
                    Color = GenerateColor(def.ComposeName),
                    ContainerName = containerName,
                    ServiceSlug = slug,
                    ComposeName = def.ComposeName,
                    Image = def.Image,
                    BuildContext = def.BuildContext,
                    EnvFile = def.EnvFiles.FirstOrDefault(),
                    IsAutoDiscovered = true,
                    IsEnabled = true,
                    SortOrder = await db.Services.CountAsync() + 1,
                };
                db.Services.Add(svc);
                created++;
            }
            else
            {
                if (string.IsNullOrEmpty(existing.ServiceSlug))
                {
                    var newSlug = _composeFile.GenerateUniqueSlug(def.ComposeName);
                    var slugTaken = await db.Services.AnyAsync(s => s.ServiceSlug == newSlug && s.Id != existing.Id)
                        || db.ChangeTracker.Entries<Service>().Any(e => e.Entity != existing && e.Entity.ServiceSlug == newSlug);
                    if (!slugTaken)
                        existing.ServiceSlug = newSlug;
                }
                existing.ComposeName = def.ComposeName;
                existing.Image = def.Image ?? existing.Image;
                existing.BuildContext = def.BuildContext ?? existing.BuildContext;
                existing.EnvFile = def.EnvFiles.FirstOrDefault() ?? existing.EnvFile;
                existing.UpdatedAt = DateTime.UtcNow;
                updated++;
            }
        }

        // 3. Remove orphaned services (in DB but no compose file + not in root compose)
        var dbServices = await db.Services.Where(s => s.IsAutoDiscovered).ToListAsync();
        foreach (var svc in dbServices)
        {
            bool hasPerServiceCompose = !string.IsNullOrEmpty(svc.ServiceSlug) && knownSlugs.Contains(svc.ServiceSlug);
            bool hasInfraCompose = !string.IsNullOrEmpty(svc.ComposeName) && infraNames.Contains(svc.ComposeName);

            if (!hasPerServiceCompose && !hasInfraCompose)
            {
                try
                {
                    var portSettings = await db.Settings
                        .Where(s => s.ServiceId == svc.Id || s.Section == svc.Name)
                        .Where(s => s.IsPortVariable)
                        .Select(s => s.Value)
                        .ToListAsync();

                    // Delete settings
                    var allSettings = await db.Settings
                        .Where(s => s.ServiceId == svc.Id || s.Section == svc.Name)
                        .ToListAsync();
                    db.Settings.RemoveRange(allSettings);

                    foreach (var val in portSettings)
                    {
                        if (int.TryParse(val, out var port))
                            await _portAccess.ClosePortIfUnusedAsync(port, "TCP");
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to clean up orphaned service {Name}", svc.Name);
                }

                var cState = await db.ContainerStates.FirstOrDefaultAsync(s => s.ContainerName == svc.ContainerName);
                if (cState != null) db.ContainerStates.Remove(cState);

                db.Services.Remove(svc);
                db.AuditLogs.Add(new AuditLog
                {
                    Action = "service_orphan_remove",
                    Target = svc.ContainerName,
                    Details = $"Auto-removed orphaned service: {svc.Name} (slug: {svc.ServiceSlug})"
                });
                orphaned++;
            }
        }

        await db.SaveChangesAsync();

        _logger.LogInformation("Compose sync: {Created} created, {Updated} updated, {Orphaned} orphaned",
            created, updated, orphaned);

        return new SyncResult(created, updated, orphaned);
    }

    public async Task<string?> GetComposeNameForSectionAsync(string section)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return await db.Services
            .Where(s => s.Name == section || s.ComposeName == section)
            .Select(s => s.ComposeName)
            .FirstOrDefaultAsync();
    }

    private static string FormatServiceName(string composeName)
    {
        return string.Join(" ", composeName.Split('-', '_')
            .Select(p => p.Length > 0 ? char.ToUpper(p[0]) + p[1..] : p));
    }

    public static string GenerateColor(string name)
    {
        var hash = name.GetHashCode();
        var colors = new[] { "#e74c3c", "#3498db", "#10b981", "#f59e0b", "#8b5cf6", "#06b6d4", "#f97316", "#ec4899", "#6366f1", "#14b8a6" };
        return colors[Math.Abs(hash) % colors.Length];
    }
}

public record SyncResult(int Created, int Updated, int Orphaned);
