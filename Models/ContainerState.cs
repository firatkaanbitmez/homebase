namespace HomeBase.API.Models;

public class ContainerState
{
    public int Id { get; set; }
    public string ContainerName { get; set; } = string.Empty;
    public int? ServiceId { get; set; }
    public Service? Service { get; set; }
    public bool IsDisabled { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
