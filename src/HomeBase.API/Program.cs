using HomeBase.API.Data;
using HomeBase.API.Hubs;
using HomeBase.API.Middleware;
using HomeBase.API.Models;
using HomeBase.API.Services;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// Database with retry for transient failures
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("Default"),
        npgsql => npgsql.EnableRetryOnFailure(
            maxRetryCount: 5,
            maxRetryDelay: TimeSpan.FromSeconds(10),
            errorCodesToAdd: null)));

// Services
builder.Services.AddSingleton<DockerService>();
builder.Services.AddSingleton<PortAccessService>();
builder.Services.AddSingleton<SystemService>();
builder.Services.AddSingleton<GpuService>();
builder.Services.AddSingleton<ComposeParserService>();
builder.Services.AddSingleton<ComposeFileService>();
builder.Services.AddSingleton<ServiceManagementService>();
builder.Services.AddSingleton<DockerHubService>();
builder.Services.AddSingleton<AiService>();
builder.Services.AddScoped<SettingsService>();
builder.Services.AddHostedService<InactivityMonitor>();

// Docker Cache + SignalR
builder.Services.AddMemoryCache();
builder.Services.AddSingleton<DockerCacheService>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<DockerCacheService>());
builder.Services.AddSignalR();

// Proxy HttpClient
builder.Services.AddHttpClient("proxy", c =>
{
    c.Timeout = TimeSpan.FromSeconds(30);
}).ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler
{
    AllowAutoRedirect = false
});

// API
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.AllowAnyMethod().AllowAnyHeader()
     .AllowCredentials().SetIsOriginAllowed(_ => true)));

var app = builder.Build();

// Global error handling
app.UseMiddleware<ErrorHandlingMiddleware>();

// Auto migrate + seed + compose sync + generate env files
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();

    // Wait for DB to be ready
    var dbReady = false;
    for (int i = 0; i < 30; i++)
    {
        try
        {
            await db.Database.CanConnectAsync();
            dbReady = true;
            break;
        }
        catch
        {
            logger.LogWarning("DB not ready, retrying ({Attempt}/30)...", i + 1);
            await Task.Delay(3000);
        }
    }
    if (!dbReady)
        throw new Exception("Could not connect to database after 30 attempts");

    db.Database.Migrate();

    // Ensure shared homebase network exists
    var composeFile = scope.ServiceProvider.GetRequiredService<ComposeFileService>();
    composeFile.EnsureNetwork();

    // Check if compose auto-discovery is available
    var composeParser = scope.ServiceProvider.GetRequiredService<ComposeParserService>();
    var composeDefs = composeParser.Parse();
    var composeAvailable = composeDefs.Count > 0;

    // Seed data (with compose-awareness)
    await DbSeeder.SeedAsync(db, composeAvailable);

    await MigrateToPerServiceCompose(db, composeParser, composeFile, scope, logger);

    // Auto-sync compose definitions to DB (scans both infra + per-service)
    var svcMgmt = scope.ServiceProvider.GetRequiredService<ServiceManagementService>();
    var result = await svcMgmt.SyncComposeToDbAsync();
    logger.LogInformation("Startup compose sync: {Created} created, {Updated} updated, {Orphaned} orphaned",
        result.Created, result.Updated, result.Orphaned);

}

app.UseCors();
app.UseSwagger();
app.UseSwaggerUI();

app.UseDefaultFiles();
app.UseStaticFiles();
app.MapControllers();
app.MapHub<DashboardHub>("/hubs/dashboard");
app.MapFallbackToFile("index.html");

// Wire up DockerCacheService → SignalR broadcasts
var cacheService = app.Services.GetRequiredService<DockerCacheService>();
var hubContext = app.Services.GetRequiredService<IHubContext<DashboardHub>>();

cacheService.OnContainersChanged += async containers =>
{
    await hubContext.Clients.All.SendAsync("ContainersUpdated", containers);
};
cacheService.OnStatsUpdated += async containers =>
{
    await hubContext.Clients.All.SendAsync("ContainersUpdated", containers);
};

app.Run();

/// <summary>
/// One-time migration: move non-infra services from root docker-compose.yml
/// into per-service directories under services/{slug}/
/// </summary>
async Task MigrateToPerServiceCompose(
    AppDbContext db, ComposeParserService composeParser, ComposeFileService composeFile,
    IServiceScope scope, ILogger logger)
{
    var projectDir = composeFile.ServicesDir.Replace("/services", "");
    var protectedServices = new HashSet<string> { "postgres", "dashboard" };

    // Find legacy services in DB that don't have ComposeFilePath yet
    var legacyServices = await db.Services
        .Where(s => s.ComposeFilePath == null && s.ComposeName != null)
        .ToListAsync();

    if (legacyServices.Count == 0)
    {
        // Also check root compose for non-infra services not yet in DB
        var rootDefs = composeParser.ParseInfra();
        var nonInfra = rootDefs.Where(d => !protectedServices.Contains(d.ComposeName)).ToList();
        if (nonInfra.Count == 0) return;

        // These are compose services not yet in DB — they'll be handled by SyncComposeToDbAsync later
        // But we should still migrate them to per-service dirs
        foreach (var def in nonInfra)
        {
            var slug = composeFile.GenerateUniqueSlug(def.ComposeName);
            await MigrateSingleService(db, composeFile, projectDir, slug, def, null, logger);
        }

        return;
    }

    // Migrate each legacy service
    var rootDefs2 = composeParser.ParseInfra();

    foreach (var svc in legacyServices)
    {
        if (protectedServices.Contains(svc.ComposeName!)) continue;

        var def = rootDefs2.FirstOrDefault(d => d.ComposeName == svc.ComposeName);
        if (def == null) continue;

        var slug = string.IsNullOrEmpty(svc.ServiceSlug)
            ? composeFile.GenerateUniqueSlug(svc.ComposeName!)
            : svc.ServiceSlug;

        await MigrateSingleService(db, composeFile, projectDir, slug, def, svc, logger);
    }

    await db.SaveChangesAsync();
    logger.LogInformation("Legacy migration complete — migrated services to per-service compose dirs");
}

async Task MigrateSingleService(
    AppDbContext db, ComposeFileService composeFile, string projectDir,
    string slug, ComposeServiceDefinition def, Service? svc, ILogger logger)
{
    try
    {
        var servicesDir = composeFile.ServicesDir;
        var serviceDir = Path.Combine(servicesDir, slug);

        // Skip if already migrated
        if (Directory.Exists(serviceDir) && File.Exists(Path.Combine(serviceDir, "docker-compose.yml")))
        {
            if (svc != null)
            {
                svc.ServiceSlug = slug;
                svc.ComposeFilePath = composeFile.GetRelativeComposeFilePath(slug);
                if (string.IsNullOrEmpty(svc.ContainerName))
                    svc.ContainerName = def.ContainerName ?? def.ComposeName;
            }
            return;
        }

        Directory.CreateDirectory(serviceDir);

        // Build per-service compose
        var tempSvc = svc ?? new Service
        {
            ServiceSlug = slug,
            ContainerName = def.ContainerName ?? def.ComposeName,
        };
        if (string.IsNullOrEmpty(tempSvc.ServiceSlug)) tempSvc.ServiceSlug = slug;

        await composeFile.WriteServiceComposeAsync(tempSvc, def);

        // Update DB record
        if (svc != null)
        {
            svc.ServiceSlug = slug;
            svc.ComposeFilePath = composeFile.GetRelativeComposeFilePath(slug);
            if (string.IsNullOrEmpty(svc.ContainerName))
                svc.ContainerName = def.ContainerName ?? def.ComposeName;
            svc.UpdatedAt = DateTime.UtcNow;
        }

        logger.LogInformation("Migrated service {ComposeName} → services/{Slug}/", def.ComposeName, slug);
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "Failed to migrate service {ComposeName} to per-service dir", def.ComposeName);
    }
}
