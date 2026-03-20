namespace HomeBase.API.Models;

public class Service
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Icon { get; set; } = string.Empty;
    public string Color { get; set; } = string.Empty;
    public string ContainerName { get; set; } = string.Empty;
    public string ServiceSlug { get; set; } = string.Empty;
    public string? ComposeFilePath { get; set; }
    public int? PreferPort { get; set; }
    public string? UrlPath { get; set; }
    public bool IsEnabled { get; set; } = true;
    public int SortOrder { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Compose metadata
    public string? ComposeName { get; set; }
    public string? Image { get; set; }
    public string? BuildContext { get; set; }
    public string? EnvFile { get; set; }
    public bool IsAutoDiscovered { get; set; }
    public int? CategoryId { get; set; }
    public ServiceCategory? Category { get; set; }
}
