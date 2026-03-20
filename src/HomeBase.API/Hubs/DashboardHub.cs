using HomeBase.API.Services;
using Microsoft.AspNetCore.SignalR;

namespace HomeBase.API.Hubs;

public class DashboardHub : Hub
{
    private readonly DockerCacheService _cache;

    public DashboardHub(DockerCacheService cache)
    {
        _cache = cache;
    }

    public override async Task OnConnectedAsync()
    {
        // Send full initial state to the new client
        var containers = await _cache.GetCachedContainersAsync();
        await Clients.Caller.SendAsync("ContainersUpdated", containers);
        await base.OnConnectedAsync();
    }
}
