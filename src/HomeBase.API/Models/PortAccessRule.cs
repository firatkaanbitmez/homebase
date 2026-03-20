using System.ComponentModel.DataAnnotations.Schema;

namespace HomeBase.API.Models;

[Table("FirewallRules")]
public class PortAccessRule
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public int Port { get; set; }
    public string Protocol { get; set; } = "TCP";
    public bool IsActive { get; set; } = true;
    public bool IsExternal { get; set; } = false;
    public int? ServiceId { get; set; }
    public Service? Service { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
