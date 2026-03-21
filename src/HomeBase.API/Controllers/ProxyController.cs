using HomeBase.API.Data;
using HomeBase.API.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HomeBase.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ProxyController : ControllerBase
{
    private readonly IHttpClientFactory _httpFactory;
    private readonly DockerService _docker;
    private readonly DockerCacheService _cache;
    private readonly AppDbContext _db;
    private readonly ILogger<ProxyController> _logger;

    public ProxyController(IHttpClientFactory httpFactory, DockerService docker,
        DockerCacheService cache, AppDbContext db, ILogger<ProxyController> logger)
    {
        _httpFactory = httpFactory;
        _docker = docker;
        _cache = cache;
        _db = db;
        _logger = logger;
    }

    [HttpGet("{port}/{**path}")]
    [HttpPost("{port}/{**path}")]
    [HttpPut("{port}/{**path}")]
    [HttpDelete("{port}/{**path}")]
    public async Task<IActionResult> Forward(int port, string? path = "")
    {
        if (port < 1 || port > 65535)
            return BadRequest("Invalid port");

        // Check if port access is blocked (IsExternal=false means proxy access denied)
        var rule = await _db.PortAccessRules
            .FirstOrDefaultAsync(r => r.Port == port && r.Protocol == "TCP" && r.IsActive);
        if (rule != null && !rule.IsExternal)
            return StatusCode(403, $"Port {port} access is disabled");

        // Find the container that has this host port mapped,
        // then resolve its internal IP + container port for proxying
        var containers = await _cache.GetCachedContainersAsync();
        string targetHost = "host.docker.internal"; // fallback
        int targetPort = port;

        foreach (var ctr in containers)
        {
            var matchedPort = ctr.Ports.FirstOrDefault(p => p.Public == port);
            if (matchedPort != null)
            {
                // Get container's internal IP via inspect
                var inspect = await _docker.InspectContainerAsync(ctr.Name);
                var ip = inspect?.Networks?.FirstOrDefault()?.IpAddress;
                if (!string.IsNullOrEmpty(ip))
                {
                    targetHost = ip;
                    targetPort = matchedPort.Private;
                }
                break;
            }
        }

        var client = _httpFactory.CreateClient("proxy");
        var target = $"http://{targetHost}:{targetPort}/{path}{Request.QueryString}";

        try
        {
            var request = new HttpRequestMessage(new HttpMethod(Request.Method), target);

            // Forward headers (skip host + connection)
            foreach (var (key, values) in Request.Headers)
            {
                if (key.Equals("Host", StringComparison.OrdinalIgnoreCase) ||
                    key.Equals("Connection", StringComparison.OrdinalIgnoreCase) ||
                    key.Equals("Transfer-Encoding", StringComparison.OrdinalIgnoreCase))
                    continue;
                request.Headers.TryAddWithoutValidation(key, values.ToArray());
            }

            // Forward body for non-GET
            if (Request.ContentLength > 0 || Request.ContentType != null)
            {
                request.Content = new StreamContent(Request.Body);
                if (Request.ContentType != null)
                    request.Content.Headers.TryAddWithoutValidation("Content-Type", Request.ContentType);
            }

            var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead);

            // Copy response headers
            foreach (var (key, values) in response.Headers)
                Response.Headers.TryAdd(key, values.ToArray());
            foreach (var (key, values) in response.Content.Headers)
                Response.Headers.TryAdd(key, values.ToArray());

            // Remove transfer-encoding to avoid conflicts
            Response.Headers.Remove("transfer-encoding");

            Response.StatusCode = (int)response.StatusCode;
            await response.Content.CopyToAsync(Response.Body);
            return new EmptyResult();
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Proxy request failed: {Target}", target);
            return StatusCode(502, $"Service on port {port} is not reachable");
        }
        catch (TaskCanceledException)
        {
            return StatusCode(504, $"Service on port {port} timed out");
        }
    }
}
