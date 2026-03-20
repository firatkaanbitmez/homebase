namespace HomeBase.API.Models;

public class SettingsHistory
{
    public int Id { get; set; }
    public int SettingId { get; set; }
    public Setting Setting { get; set; } = null!;
    public string? OldValue { get; set; }
    public string NewValue { get; set; } = string.Empty;
    public DateTime ChangedAt { get; set; } = DateTime.UtcNow;
}
