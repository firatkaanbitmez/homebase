namespace HomeBase.API.Models;

public class FirewallRule
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public int Port { get; set; }
    public string Protocol { get; set; } = "TCP";
    public bool IsActive { get; set; } = true;
    public bool IsExternal { get; set; } = true;
    public int? ServiceId { get; set; }
    public Service? Service { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
