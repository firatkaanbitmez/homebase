namespace HomeBase.API.Models;

public class AuditLog
{
    public int Id { get; set; }
    public string Action { get; set; } = string.Empty;       // start, stop, restart, env_change, firewall
    public string Target { get; set; } = string.Empty;       // container name or key
    public string? Details { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
