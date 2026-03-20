using HomeBase.API.Models;

namespace HomeBase.API.Data;

public static class ServiceCatalog
{
    public static List<CatalogEntry> GetAll() => Entries;

    public static CatalogEntry? GetByName(string name) =>
        Entries.FirstOrDefault(e => e.Name.Equals(name, StringComparison.OrdinalIgnoreCase));

    private static readonly List<CatalogEntry> Entries = new()
    {
        // Media
        new("Jellyfin", "Open-source media server", "jellyfin/jellyfin:latest", "Media", new[] { "8096:8096" }, new[] { "./jellyfin/config:/config", "./jellyfin/media:/media" }),
        new("Plex", "Media server for streaming", "plexinc/pms-docker:latest", "Media", new[] { "32400:32400" }, new[] { "./plex/config:/config", "./plex/media:/data" }),
        new("Navidrome", "Music server and streamer", "deluan/navidrome:latest", "Media", new[] { "4533:4533" }, new[] { "./navidrome/data:/data", "./navidrome/music:/music:ro" }),
        new("Sonarr", "TV series management", "linuxserver/sonarr:latest", "Media", new[] { "8989:8989" }, new[] { "./sonarr/config:/config" }),
        new("Radarr", "Movie management", "linuxserver/radarr:latest", "Media", new[] { "7878:7878" }, new[] { "./radarr/config:/config" }),

        // Development
        new("Archon", "AI-powered project management", "archon:latest", "Development", new[] { "3005:3005" }, Array.Empty<string>()),
        new("Gitea", "Lightweight Git hosting", "gitea/gitea:latest", "Development", new[] { "3003:3000", "2222:22" }, new[] { "./gitea/data:/data" }),
        new("Code Server", "VS Code in the browser", "linuxserver/code-server:latest", "Development", new[] { "8443:8443" }, new[] { "./code-server/config:/config" }),
        new("Drone", "CI/CD platform", "drone/drone:latest", "Development", new[] { "8000:80" }, Array.Empty<string>()),
        new("Registry", "Docker registry", "registry:2", "Development", new[] { "5050:5000" }, new[] { "./registry/data:/var/lib/registry" }),

        // Monitoring
        new("Grafana", "Monitoring dashboards", "grafana/grafana:latest", "Monitoring", new[] { "3004:3000" }, new[] { "./grafana/data:/var/lib/grafana" }),
        new("Prometheus", "Metrics collection", "prom/prometheus:latest", "Monitoring", new[] { "9090:9090" }, new[] { "./prometheus/data:/prometheus" }),
        new("Uptime Kuma", "Service uptime monitoring", "louislam/uptime-kuma:latest", "Monitoring", new[] { "3001:3001" }, new[] { "./uptime-kuma/data:/app/data" }),
        new("Glances", "System monitoring", "nicolargo/glances:latest-full", "Monitoring", new[] { "61208:61208" }, new[] { "/var/run/docker.sock:/var/run/docker.sock:ro" }),
        new("Dozzle", "Docker log viewer", "amir20/dozzle:latest", "Monitoring", new[] { "9999:8080" }, new[] { "/var/run/docker.sock:/var/run/docker.sock:ro" }),

        // Productivity
        new("Nextcloud", "Self-hosted cloud storage", "nextcloud:latest", "Productivity", new[] { "8082:80" }, new[] { "./nextcloud/data:/var/www/html" }),
        new("Bookstack", "Wiki and documentation", "linuxserver/bookstack:latest", "Productivity", new[] { "6875:80" }, new[] { "./bookstack/config:/config" }),
        new("n8n", "Workflow automation", "n8nio/n8n:latest", "Productivity", new[] { "5678:5678" }, new[] { "./n8n/data:/home/node/.n8n" }),
        new("Stirling PDF", "PDF tools", "stirlingtools/stirling-pdf:latest", "Productivity", new[] { "8080:8080" }, Array.Empty<string>()),
        new("IT-Tools", "Developer utilities", "corentinth/it-tools:latest", "Productivity", new[] { "4000:80" }, Array.Empty<string>()),
        new("Paperless-ngx", "Document management", "ghcr.io/paperless-ngx/paperless-ngx:latest", "Productivity", new[] { "8010:8000" }, new[] { "./paperless/data:/usr/src/paperless/data", "./paperless/media:/usr/src/paperless/media" }),

        // Security
        new("Vaultwarden", "Bitwarden-compatible password manager", "vaultwarden/server:latest", "Security", new[] { "8081:80" }, new[] { "./vaultwarden/data:/data" }),
        new("Pi-hole", "Network-wide ad blocker", "pihole/pihole:latest", "Security", new[] { "8053:80", "53:53/udp" }, new[] { "./pihole/etc:/etc/pihole" }),
        new("CrowdSec", "Collaborative security engine", "crowdsecurity/crowdsec:latest", "Security", new[] { "8083:8080" }, new[] { "./crowdsec/config:/etc/crowdsec" }),

        // AI/ML
        new("Ollama", "Local LLM runtime", "ollama/ollama:latest", "AI/ML", new[] { "11434:11434" }, new[] { "./ollama/data:/root/.ollama" }),
        new("Open WebUI", "Chat interface for LLMs", "ghcr.io/open-webui/open-webui:main", "AI/ML", new[] { "8090:8080" }, Array.Empty<string>(), new Dictionary<string, string> { ["OLLAMA_BASE_URL"] = "http://ollama:11434" }),
        new("LocalAI", "OpenAI-compatible local API", "localai/localai:latest", "AI/ML", new[] { "8084:8080" }, new[] { "./localai/models:/models" }),

        // Storage
        new("MinIO", "S3-compatible object storage", "minio/minio:latest", "Storage", new[] { "9002:9000", "9003:9001" }, new[] { "./minio/data:/data" }),
        new("FileBrowser", "Web file manager", "filebrowser/filebrowser:latest", "Storage", new[] { "4001:80" }, new[] { "./filebrowser/files:/srv" }),

        // Networking
        new("Nginx Proxy Manager", "Reverse proxy with SSL", "jc21/nginx-proxy-manager:latest", "Networking", new[] { "80:80", "443:443", "81:81" }, new[] { "./npm/data:/data", "./npm/letsencrypt:/etc/letsencrypt" }),
        new("Traefik", "Cloud-native reverse proxy", "traefik:latest", "Networking", new[] { "80:80", "8085:8080" }, new[] { "/var/run/docker.sock:/var/run/docker.sock:ro" }),
        new("WireGuard", "VPN server", "linuxserver/wireguard:latest", "Networking", new[] { "51820:51820/udp" }, new[] { "./wireguard/config:/config" }),
        new("Portainer", "Docker management UI", "portainer/portainer-ce:latest", "Networking", new[] { "9000:9000" }, new[] { "/var/run/docker.sock:/var/run/docker.sock:ro", "./portainer/data:/data" }),

        // Data
        new("CyberChef", "Data transformation tool", "ghcr.io/gchq/cyberchef:latest", "Productivity", new[] { "8100:80" }, Array.Empty<string>()),
        new("Changedetection", "Website change tracker", "ghcr.io/dgtlmoon/changedetection.io:latest", "Monitoring", new[] { "5000:5000" }, new[] { "./changedetection/data:/datastore" }),
        new("Home Assistant", "Home automation", "ghcr.io/home-assistant/home-assistant:stable", "Productivity", new[] { "8123:8123" }, new[] { "./homeassistant/config:/config" }),
    };
}

public class CatalogEntry
{
    public string Name { get; set; }
    public string Description { get; set; }
    public string Image { get; set; }
    public string Category { get; set; }
    public string[] DefaultPorts { get; set; }
    public string[] DefaultVolumes { get; set; }
    public Dictionary<string, string> DefaultEnv { get; set; }

    public CatalogEntry(string name, string description, string image, string category,
        string[] defaultPorts, string[] defaultVolumes, Dictionary<string, string>? defaultEnv = null)
    {
        Name = name;
        Description = description;
        Image = image;
        Category = category;
        DefaultPorts = defaultPorts;
        DefaultVolumes = defaultVolumes;
        DefaultEnv = defaultEnv ?? new();
    }
}
