using System.Text.Json;

namespace HomeBase.API.Services;

public class DockerHubService
{
    private readonly ILogger<DockerHubService> _logger;
    private readonly HttpClient _http;
    private readonly Dictionary<string, (DateTime expiry, object data)> _cache = new();
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
}

public record DockerHubResult(
    string Name, string Description, int StarCount, long PullCount,
    bool IsOfficial, bool IsAutomated
);
