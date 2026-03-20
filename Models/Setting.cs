namespace HomeBase.API.Models;

public class Setting
{
    public int Id { get; set; }
    public string Section { get; set; } = string.Empty;  // e.g. "Stirling PDF"
    public string Key { get; set; } = string.Empty;       // e.g. "STIRLING_PORT"
    public string Value { get; set; } = string.Empty;     // e.g. "8080"
    public bool IsSecret { get; set; }                     // mask in UI
    public int SortOrder { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Per-service env
    public int? ServiceId { get; set; }                    // FK → Service.Id (null = global/infra)
    public Service? Service { get; set; }
    public string? Description { get; set; }               // tooltip description
    public bool IsPortVariable { get; set; }               // is this a port variable
    public int Version { get; set; } = 1;                  // for optimistic concurrency
}
