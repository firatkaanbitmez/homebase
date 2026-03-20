namespace HomeBase.API.Models;

public record ContainerDto(
    string Id, string Name, string Image, string State, string Status,
    List<PortDto> Ports, ContainerStatsDto? Stats,
    int? IdleMinutes, bool Protected, bool UserDisabled
);

public record PortDto(int Public, int Private, string? Ip = null);

public record ContainerStatsDto(
    string Cpu, string MemPercent, string MemMB, long RxBytes, long TxBytes,
    long BlockRead = 0, long BlockWrite = 0, int PidCount = 0
);

public record DiskDto(string Name, int Total, int Used, int Percent);

public record EnvSectionDto(string Name, List<EnvVarDto> Vars, string? ComposeName = null, int? ServiceId = null);
public record EnvVarDto(string Key, string Value, string? Description = null, bool IsPort = false);

public record EnvUpdateRequest(List<EnvChangeDto> Changes, string? Service, int? ServiceId = null);
public record EnvChangeDto(string Key, string Value, string? OldValue);

public record ApplyResult(bool Ok, string? Recreated, string? Error, bool PortsUpdated);
public record DeleteResult(bool Ok, string? Error, List<string>? Warnings = null);

public record ContainerInspectDto(
    string Id, string Name, string Image, string ImageId,
    DateTime Created, int RestartCount,
    List<MountDto> Mounts, List<string> Env,
    string? HealthStatus,
    long MemoryLimit,
    double CpuLimit,
    string RestartPolicy,
    int RestartMaxRetry,
    long SizeRw,
    long SizeRootFs,
    List<ContainerNetworkDto> Networks
);
public record MountDto(string Type, string Source, string Destination, bool ReadOnly);
public record ContainerNetworkDto(string Name, string IpAddress, string Gateway, int PrefixLen);

public record GpuInfoDto(
    bool Available,
    string? DriverVersion,
    List<GpuDeviceDto> Devices
);
public record GpuDeviceDto(
    int Index, string Name, string TemperatureC,
    string UtilizationGpu, string UtilizationMemory,
    string MemoryUsed, string MemoryTotal, string PowerDraw
);

public record ApiError(string Code, string Message, string? Detail = null);

// Service DTOs
public record ServiceResponse(
    int Id, string Name, string Description, string Icon, string Color,
    string ContainerName, int? PreferPort, string? UrlPath, bool IsEnabled,
    int SortOrder, string? ComposeName, string? Image, string? BuildContext,
    string? EnvFile, bool IsAutoDiscovered, string? Category, int? CategoryId,
    string ServiceSlug = "", string? ComposeFilePath = null, string? DeployStatus = null
);

public record CreateServiceRequest(
    string Name, string Description, string Icon, string Color,
    string ContainerName, int? PreferPort, string? UrlPath,
    int SortOrder, string? ComposeName, int? CategoryId
);

public record UpdateServiceRequest(
    string Name, string Description, string Icon, string Color,
    string ContainerName, int? PreferPort, string? UrlPath,
    bool IsEnabled, int SortOrder, string? ComposeName, int? CategoryId
);

// Compose DTOs
public record ComposeServiceResponse(
    string ComposeName, string? ContainerName, string? Image,
    string? BuildContext, List<string> Ports, List<string> EnvFiles,
    Dictionary<string, string> Environment, List<string> Volumes,
    List<string> DependsOn, string? RestartPolicy
);

// Onboarding DTOs
public record CatalogItemResponse(
    string Name, string Description, string Image, string Category,
    string[] DefaultPorts, string[] DefaultVolumes, Dictionary<string, string> DefaultEnv,
    int StarCount = 0, long PullCount = 0, bool IsOfficial = false, string? LogoUrl = null
);

public record DeployRequest(
    string Name, string? Image, string? BuildContext, string? ComposeName,
    Dictionary<string, string>? Ports, Dictionary<string, string>? EnvVars,
    List<string>? Volumes, string? Category, string? Description,
    List<string>? DependsOn, Dictionary<string, string>? Environment,
    string? Icon = null, string? Color = null
);

public record DeployResponse(bool Ok, string? ContainerName, string? Error);

public record PreviewRequest(
    string Name, string? Image, string? ComposeName,
    Dictionary<string, string>? Ports, Dictionary<string, string>? EnvVars,
    List<string>? Volumes, string? BuildContext = null,
    List<string>? DependsOn = null, Dictionary<string, string>? Environment = null
);

public record PreviewResponse(string ComposeYaml, string? EnvFileContent);

// AI DTOs
public record AiAnalysisRequest(string ProjectPath);

public record AiAnalysisResult(
    string ServiceName,
    string? Image,
    string? BuildContext,
    string? Dockerfile,
    List<AiPortMapping> Ports,
    Dictionary<string, string> EnvVars,
    List<string> Volumes,
    List<string> DependsOn,
    string Explanation
);

public record AiPortMapping(int Host, int Container);
public record DirectoryEntry(string Name, string Path, bool HasSubdirs, bool IsProject);
public record AiStatusResponse(bool Enabled, bool HasApiKey, string Model);
public record WriteDockerfileRequest(string ProjectPath, string Content);

public record FixRedeployRequest(string ServiceSlug, string? FixedYaml);

// Agent Fix DTOs
public record AgentFixRequest(
    string ServiceSlug,
    List<PreviousAttempt>? PreviousAttempts = null,
    string? UserInstruction = null,
    string? Language = null
);
public record PreviousAttempt(string FixDescription, string ResultLogs);

public record AgentFixResponse(
    string Reasoning,
    AgentFix? Fix,
    string? UserActionRequired
);
public record AgentFix(string Type, string Content, string Description);

public record ComposeUpdateRequest(string Yaml);
public record ComposeAiAssistRequest(string? Yaml = null, string? Instruction = null);

public record PortAccessEntry(
    int Port, string Protocol, string? ServiceName, string? ContainerName,
    bool IsExternal, bool HasRule, int? ServiceId
);
