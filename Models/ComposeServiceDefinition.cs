namespace HomeBase.API.Models;

public class ComposeServiceDefinition
{
    public string ComposeName { get; set; } = string.Empty;
    public string? ContainerName { get; set; }
    public string? Image { get; set; }
    public string? BuildContext { get; set; }
    public List<string> Ports { get; set; } = new();
    public List<string> EnvFiles { get; set; } = new();
    public Dictionary<string, string> Environment { get; set; } = new();
    public List<string> Volumes { get; set; } = new();
    public List<string> DependsOn { get; set; } = new();
    public string? RestartPolicy { get; set; }
    public string? Command { get; set; }
}
