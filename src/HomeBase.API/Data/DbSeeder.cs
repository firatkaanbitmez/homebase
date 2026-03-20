using HomeBase.API.Models;
using Microsoft.EntityFrameworkCore;

namespace HomeBase.API.Data;

public static class DbSeeder
{
    public static async Task SeedAsync(AppDbContext db, bool composeAutoDiscoveryAvailable = false)
    {
        // Seed services — only if no services exist AND compose auto-discovery isn't available
        if (!await db.Services.AnyAsync())
        {
            if (!composeAutoDiscoveryAvailable)
            {
                db.Services.AddRange(GetDefaultServices());
                await db.SaveChangesAsync();
            }
        }
        else
        {
            await BackfillComposeNamesAsync(db);
        }

        // Seed default settings (only on first run)
        if (!await db.Settings.AnyAsync())
        {
            db.AuditLogs.Add(new AuditLog { Action = "system", Target = "seed", Details = "Default settings created" });
            await db.SaveChangesAsync();
        }

        // Remove legacy HOST_IP setting if present
        var hostIp = await db.Settings.FirstOrDefaultAsync(s => s.Key == "HOST_IP");
        if (hostIp != null)
        {
            db.Settings.Remove(hostIp);
            await db.SaveChangesAsync();
        }

        // AI Configuration seed (if not already present)
        if (!await db.Settings.AnyAsync(s => s.Section == "AI Configuration"))
        {
            var aiOrder = await db.Settings.CountAsync();
            db.Settings.AddRange(
                new Setting { Section = "AI Configuration", Key = "AI_ENABLED", Value = "false",
                              IsSecret = false, SortOrder = aiOrder++, Description = "Enable AI features" },
                new Setting { Section = "AI Configuration", Key = "AI_PROVIDER", Value = "openai",
                              IsSecret = false, SortOrder = aiOrder++, Description = "AI Provider (openai, gemini, claude, custom)" },
                new Setting { Section = "AI Configuration", Key = "AI_API_KEY", Value = "",
                              IsSecret = true, SortOrder = aiOrder++, Description = "AI API Key" },
                new Setting { Section = "AI Configuration", Key = "AI_MODEL", Value = "gpt-4.1-mini",
                              IsSecret = false, SortOrder = aiOrder++, Description = "AI model" },
                new Setting { Section = "AI Configuration", Key = "AI_BASE_URL", Value = "",
                              IsSecret = false, SortOrder = aiOrder++, Description = "Custom AI base URL (for custom provider)" }
            );
            await db.SaveChangesAsync();
        }

        // Migrate OPENAI_API_KEY → AI_API_KEY if needed
        var oldApiKey = await db.Settings.FirstOrDefaultAsync(s => s.Key == "OPENAI_API_KEY");
        if (oldApiKey != null)
        {
            var newApiKey = await db.Settings.FirstOrDefaultAsync(s => s.Key == "AI_API_KEY");
            if (newApiKey == null)
            {
                oldApiKey.Key = "AI_API_KEY";
                oldApiKey.Description = "AI API Key";
            }
            else if (!string.IsNullOrEmpty(oldApiKey.Value) && string.IsNullOrEmpty(newApiKey.Value))
            {
                newApiKey.Value = oldApiKey.Value;
                db.Settings.Remove(oldApiKey);
            }
            else
            {
                db.Settings.Remove(oldApiKey);
            }
            await db.SaveChangesAsync();
        }

        // Ensure AI_PROVIDER and AI_BASE_URL exist (for existing installations)
        if (!await db.Settings.AnyAsync(s => s.Key == "AI_PROVIDER"))
        {
            var aiOrder = await db.Settings.CountAsync();
            db.Settings.Add(new Setting { Section = "AI Configuration", Key = "AI_PROVIDER", Value = "openai",
                              IsSecret = false, SortOrder = aiOrder, Description = "AI Provider (openai, gemini, claude, custom)" });
            await db.SaveChangesAsync();
        }
        if (!await db.Settings.AnyAsync(s => s.Key == "AI_BASE_URL"))
        {
            var aiOrder = await db.Settings.CountAsync();
            db.Settings.Add(new Setting { Section = "AI Configuration", Key = "AI_BASE_URL", Value = "",
                              IsSecret = false, SortOrder = aiOrder, Description = "Custom AI base URL (for custom provider)" });
            await db.SaveChangesAsync();
        }
    }

    /// Backfill ComposeName for existing services that don't have it set
    private static async Task BackfillComposeNamesAsync(AppDbContext db)
    {
        var services = await db.Services.Where(s => s.ComposeName == null).ToListAsync();
        if (services.Count == 0) return;

        // Use containerName as composeName since they match in the current setup
        foreach (var svc in services)
        {
            svc.ComposeName = svc.ContainerName;
        }
        await db.SaveChangesAsync();
    }

    private static List<Service> GetDefaultServices() => new()
    {
        new() { Name = "Stirling PDF", Description = "PDF duzenleme, birlestirme, bolme ve donusturme araci", Icon = "/icons/stirling-pdf.png", Color = "#e74c3c", ContainerName = "stirling-pdf", ComposeName = "stirling-pdf", SortOrder = 1 },
        new() { Name = "Glances", Description = "Sistem izleme - CPU, RAM, disk, ag ve Docker durumu", Icon = "/icons/glances.svg", Color = "#10b981", ContainerName = "glances", ComposeName = "glances", SortOrder = 2 },
        new() { Name = "Nginx Proxy Manager", Description = "Reverse proxy yonetimi, SSL ve domain yonlendirme", Icon = "/icons/npm.png", Color = "#f15b2a", ContainerName = "nginx-proxy-manager", ComposeName = "nginx-proxy-manager", PreferPort = 81, SortOrder = 3 },
        new() { Name = "n8n", Description = "Is akisi otomasyonu - Zapier/IFTTT alternatifi", Icon = "/icons/n8n.png", Color = "#ea4b71", ContainerName = "n8n", ComposeName = "n8n", SortOrder = 4 },
        new() { Name = "IT-Tools", Description = "80+ gelistirici araci - hash, base64, regex, QR, JWT ve dahasi", Icon = "/icons/it-tools.ico", Color = "#5468ff", ContainerName = "it-tools", ComposeName = "it-tools", SortOrder = 5 },
        new() { Name = "FileBrowser", Description = "Web tabanli dosya yoneticisi - upload, download, paylasim", Icon = "/icons/filebrowser.svg", Color = "#3498db", ContainerName = "filebrowser", ComposeName = "filebrowser", SortOrder = 6 },
        new() { Name = "Jellyfin", Description = "Medya sunucusu - film, dizi, muzik izleme", Icon = "/icons/jellyfin.svg", Color = "#00a4dc", ContainerName = "jellyfin", ComposeName = "jellyfin", SortOrder = 7 },
        new() { Name = "Portainer", Description = "Docker container yonetim paneli", Icon = "/icons/portainer.ico", Color = "#13bef9", ContainerName = "portainer", ComposeName = "portainer", SortOrder = 8 },
        new() { Name = "Code Server", Description = "Tarayicida VS Code - her cihazdan kod yazma", Icon = "/icons/code-server.svg", Color = "#007acc", ContainerName = "code-server", ComposeName = "code-server", SortOrder = 9 },
        new() { Name = "Uptime Kuma", Description = "Servis izleme ve bildirim - cokme algilama", Icon = "/icons/uptime-kuma.svg", Color = "#5cdd8b", ContainerName = "uptime-kuma", ComposeName = "uptime-kuma", SortOrder = 10 },
        new() { Name = "Open WebUI", Description = "ChatGPT benzeri arayuz - yerel LLM ile sohbet", Icon = "/icons/open-webui.png", Color = "#1a1a2e", ContainerName = "open-webui", ComposeName = "open-webui", SortOrder = 11 },
        new() { Name = "Changedetection", Description = "Web sayfasi degisiklik takibi - fiyat, stok bildirimi", Icon = "/icons/changedetection.png", Color = "#ff6b35", ContainerName = "changedetection", ComposeName = "changedetection", SortOrder = 12 },
        new() { Name = "CyberChef", Description = "Veri donusturme - encode, decode, sifreleme, hash", Icon = "/icons/cyberchef.png", Color = "#4a86c8", ContainerName = "cyberchef", ComposeName = "cyberchef", SortOrder = 13 },
        new() { Name = "Dozzle", Description = "Docker container loglarini canli izleme", Icon = "/icons/dozzle.svg", Color = "#2596be", ContainerName = "dozzle", ComposeName = "dozzle", SortOrder = 14 },
        new() { Name = "MinIO", Description = "S3 uyumlu object storage - dosya depolama API", Icon = "/icons/minio.png", Color = "#c72e49", ContainerName = "minio", ComposeName = "minio", PreferPort = 9003, SortOrder = 15 },
    };

}
