using System.Text.Json;
using HomeBase.API.Data;

namespace HomeBase.API.Services;

public class DockerHubService
{
    private readonly ILogger<DockerHubService> _logger;
    private readonly HttpClient _http;
    private readonly Dictionary<string, (DateTime expiry, object? data)> _cache = new();
    private static readonly TimeSpan CacheDuration = TimeSpan.FromMinutes(5);

    public DockerHubService(ILogger<DockerHubService> logger)
    {
        _logger = logger;
        _http = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
        _http.DefaultRequestHeaders.Add("User-Agent", "HomeBase/1.0");
    }

    public async Task<List<DockerHubResult>> SearchAsync(string query, int limit = 25)
    {
        if (string.IsNullOrWhiteSpace(query)) return new();

        var cacheKey = $"{query}:{limit}";
        if (_cache.TryGetValue(cacheKey, out var cached) && cached.expiry > DateTime.UtcNow)
            return (List<DockerHubResult>)cached.data;

        try
        {
            var url = $"https://hub.docker.com/v2/search/repositories/?query={Uri.EscapeDataString(query)}&page_size={limit}";
            var res = await _http.GetAsync(url);
            if (!res.IsSuccessStatusCode)
            {
                _logger.LogWarning("Docker Hub search failed: {Status}", res.StatusCode);
                return new();
            }

            var json = await res.Content.ReadAsStringAsync();
            var doc = JsonDocument.Parse(json);
            var results = new List<DockerHubResult>();

            if (doc.RootElement.TryGetProperty("results", out var arr))
            {
                foreach (var item in arr.EnumerateArray())
                {
                    results.Add(new DockerHubResult(
                        Name: item.GetProperty("repo_name").GetString() ?? "",
                        Description: item.TryGetProperty("short_description", out var desc) ? desc.GetString() ?? "" : "",
                        StarCount: item.TryGetProperty("star_count", out var stars) ? stars.GetInt32() : 0,
                        PullCount: item.TryGetProperty("pull_count", out var pulls) ? pulls.GetInt64() : 0,
                        IsOfficial: item.TryGetProperty("is_official", out var off) && off.GetBoolean(),
                        IsAutomated: item.TryGetProperty("is_automated", out var auto) && auto.GetBoolean()
                    ));
                }
            }

            _cache[cacheKey] = (DateTime.UtcNow + CacheDuration, results);
            return results;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Docker Hub search error for query: {Query}", query);
            return new();
        }
    }
    /// Fetch repository info (description, stars, pulls, logo) for a specific image
    public async Task<DockerHubRepoInfo?> GetRepoInfoAsync(string image)
    {
        var imageName = image.Split(':')[0]; // strip tag
        var cacheKey = $"repo:{imageName}";
        if (_cache.TryGetValue(cacheKey, out var cached) && cached.expiry > DateTime.UtcNow)
            return (DockerHubRepoInfo?)cached.data;

        // Skip non-Docker Hub registries
        if (imageName.StartsWith("ghcr.io/") || imageName.StartsWith("mcr.microsoft.com/"))
        {
            _cache[cacheKey] = (DateTime.UtcNow + CacheDuration, (object?)null);
            return null;
        }

        try
        {
            string namespace_, repo;
            if (imageName.Contains('/'))
            {
                var parts = imageName.Split('/', 2);
                namespace_ = parts[0];
                repo = parts[1];
            }
            else
            {
                namespace_ = "library";
                repo = imageName;
            }

            // 1. Fetch repo details (description, stars, pulls)
            string description = "";
            int starCount = 0;
            long pullCount = 0;
            bool isOfficial = false;

            try
            {
                var repoUrl = $"https://hub.docker.com/v2/repositories/{namespace_}/{repo}/";
                var repoRes = await _http.GetAsync(repoUrl);
                if (repoRes.IsSuccessStatusCode)
                {
                    var repoJson = await repoRes.Content.ReadAsStringAsync();
                    var repoDoc = JsonDocument.Parse(repoJson);
                    var root = repoDoc.RootElement;
                    description = root.TryGetProperty("description", out var d) ? d.GetString() ?? "" : "";
                    starCount = root.TryGetProperty("star_count", out var s) ? s.GetInt32() : 0;
                    pullCount = root.TryGetProperty("pull_count", out var p) ? p.GetInt64() : 0;
                    isOfficial = root.TryGetProperty("is_official", out var o) && o.GetBoolean();
                }
            }
            catch { }

            // 2. Fetch logo from catalog search API
            string? logoUrl = null;
            try
            {
                var searchQuery = imageName.Contains('/') ? repo : imageName;
                var searchUrl = $"https://hub.docker.com/api/search/v3/catalog/search?query={Uri.EscapeDataString(searchQuery)}&from=0&size=5";
                var searchRes = await _http.GetAsync(searchUrl);
                if (searchRes.IsSuccessStatusCode)
                {
                    var searchJson = await searchRes.Content.ReadAsStringAsync();
                    var searchDoc = JsonDocument.Parse(searchJson);
                    if (searchDoc.RootElement.TryGetProperty("results", out var results))
                    {
                        // Find the matching result by slug or name
                        foreach (var result in results.EnumerateArray())
                        {
                            var slug = result.TryGetProperty("slug", out var sl) ? sl.GetString() : null;
                            var name = result.TryGetProperty("name", out var nm) ? nm.GetString() : null;
                            if (slug == imageName || slug == repo || name == repo ||
                                (namespace_ != "library" && slug == $"{namespace_}/{repo}"))
                            {
                                if (result.TryGetProperty("logo_url", out var logoObj))
                                {
                                    if (logoObj.ValueKind == JsonValueKind.Object)
                                    {
                                        logoUrl = logoObj.TryGetProperty("small", out var small) ? small.GetString()
                                            : logoObj.TryGetProperty("large", out var large) ? large.GetString()
                                            : null;
                                    }
                                    else if (logoObj.ValueKind == JsonValueKind.String)
                                    {
                                        logoUrl = logoObj.GetString();
                                    }
                                }
                                break;
                            }
                        }
                        // Fallback: use first result if no exact match
                        if (logoUrl == null && results.GetArrayLength() > 0)
                        {
                            var first = results[0];
                            if (first.TryGetProperty("logo_url", out var logoObj2))
                            {
                                if (logoObj2.ValueKind == JsonValueKind.Object)
                                    logoUrl = logoObj2.TryGetProperty("small", out var s2) ? s2.GetString() : null;
                                else if (logoObj2.ValueKind == JsonValueKind.String)
                                    logoUrl = logoObj2.GetString();
                            }
                        }
                    }
                }
            }
            catch { }

            var info = new DockerHubRepoInfo(description, starCount, pullCount, isOfficial, logoUrl);
            _cache[cacheKey] = (DateTime.UtcNow + CacheDuration, info);
            return info;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Docker Hub repo info fetch failed for {Image}", imageName);
            _cache[cacheKey] = (DateTime.UtcNow + CacheDuration, (object?)null);
            return null;
        }
    }

    /// Enrich a list of catalog entries with Docker Hub data (parallel, best-effort)
    public async Task<List<EnrichedCatalogItem>> EnrichCatalogAsync(List<CatalogEntry> entries)
    {
        var tasks = entries.Select(async e =>
        {
            var info = await GetRepoInfoAsync(e.Image);
            return new EnrichedCatalogItem(
                e.Name,
                info?.Description ?? e.Description,
                e.Image, e.Category,
                e.DefaultPorts, e.DefaultVolumes, e.DefaultEnv,
                info?.StarCount ?? 0,
                info?.PullCount ?? 0,
                info?.IsOfficial ?? false,
                info?.LogoUrl
            );
        });

        return (await Task.WhenAll(tasks)).ToList();
    }
}

public record DockerHubRepoInfo(
    string Description, int StarCount, long PullCount, bool IsOfficial, string? LogoUrl
);

public record EnrichedCatalogItem(
    string Name, string Description, string Image, string Category,
    string[] DefaultPorts, string[] DefaultVolumes, Dictionary<string, string> DefaultEnv,
    int StarCount, long PullCount, bool IsOfficial, string? LogoUrl
);

public record DockerHubResult(
    string Name, string Description, int StarCount, long PullCount,
    bool IsOfficial, bool IsAutomated
);
