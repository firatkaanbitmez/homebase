using HomeBase.API.Models;
using YamlDotNet.RepresentationModel;
using System.Text.RegularExpressions;

namespace HomeBase.API.Services;

public record PortInfo(string ComposeName, int HostPort, int ContainerPort, string Protocol);

public class ComposeParserService
{
    private readonly IConfiguration _config;
    private readonly ILogger<ComposeParserService> _logger;

    public ComposeParserService(IConfiguration config, ILogger<ComposeParserService> logger)
    {
        _config = config;
        _logger = logger;
    }

    private string ProjectDir => _config["Paths:ProjectDir"] ?? "/app/project";
    private string ComposePath => Path.Combine(ProjectDir, "docker-compose.yml");
    private string ServicesDir => Path.Combine(ProjectDir, "services");

    /// Parse the root (infra) compose file only — postgres + dashboard
    public List<ComposeServiceDefinition> ParseInfra()
    {
        return ParseComposeFile(ComposePath, ProjectDir);
    }

    /// Legacy alias — parses root compose (for backward compat during migration)
    public List<ComposeServiceDefinition> Parse()
    {
        return ParseInfra();
    }

    /// Parse a single per-service compose by slug
    public ComposeServiceDefinition? ParseBySlug(string slug)
    {
        var composePath = Path.Combine(ServicesDir, slug, "docker-compose.yml");
        if (!File.Exists(composePath)) return null;

        var defs = ParseComposeFile(composePath, Path.Combine(ServicesDir, slug));
        return defs.FirstOrDefault();
    }

    /// Parse ALL per-service compose files from services/*/docker-compose.yml
    public List<ComposeServiceDefinition> ParseAll()
    {
        var results = new List<ComposeServiceDefinition>();

        if (!Directory.Exists(ServicesDir))
            return results;

        foreach (var dir in Directory.GetDirectories(ServicesDir))
        {
            var composePath = Path.Combine(dir, "docker-compose.yml");
            if (!File.Exists(composePath)) continue;

            try
            {
                var defs = ParseComposeFile(composePath, dir);
                results.AddRange(defs);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to parse {Path}", composePath);
            }
        }

        _logger.LogInformation("ParseAll: parsed {Count} services from per-service compose files", results.Count);
        return results;
    }

    /// Extract port variable names from port mappings
    public List<string> GetPortVariableNames(List<ComposeServiceDefinition> defs)
    {
        var portVars = new List<string>();
        var regex = new Regex(@"\$\{(\w+)(?::-([\w]+))?\}");

        foreach (var def in defs)
        {
            foreach (var port in def.Ports)
            {
                var match = regex.Match(port);
                if (match.Success)
                    portVars.Add(match.Groups[1].Value);
            }
        }

        return portVars.Distinct().ToList();
    }

    /// Extract raw port mappings before interpolation for detecting port variables
    public Dictionary<string, string> GetRawPortMappings()
    {
        var result = new Dictionary<string, string>();

        // Parse root compose
        AddRawPortMappings(ComposePath, result);

        // Parse per-service compose files
        if (Directory.Exists(ServicesDir))
        {
            foreach (var dir in Directory.GetDirectories(ServicesDir))
            {
                var composePath = Path.Combine(dir, "docker-compose.yml");
                AddRawPortMappings(composePath, result);
            }
        }

        return result;
    }

    /// Get all resolved host ports from ALL compose files (infra + per-service)
    public Dictionary<int, PortInfo> GetAllHostPorts()
    {
        var result = new Dictionary<int, PortInfo>();

        // Infra compose
        AddHostPorts(ParseInfra(), result);

        // Per-service compose files
        AddHostPorts(ParseAll(), result);

        return result;
    }

    private List<ComposeServiceDefinition> ParseComposeFile(string composePath, string contextDir)
    {
        var results = new List<ComposeServiceDefinition>();

        if (!File.Exists(composePath))
            return results;

        try
        {
            var globalEnv = LoadEnvFromDir(contextDir);
            // Also load root .env for infra variable resolution
            if (contextDir != ProjectDir)
            {
                var rootEnv = LoadEnvFromDir(ProjectDir);
                foreach (var (k, v) in rootEnv)
                    globalEnv.TryAdd(k, v);
            }

            var yaml = new YamlStream();
            using var reader = new StreamReader(composePath);
            yaml.Load(reader);

            var root = (YamlMappingNode)yaml.Documents[0].RootNode;
            if (!root.Children.TryGetValue(new YamlScalarNode("services"), out var servicesNode))
                return results;

            var servicesMap = (YamlMappingNode)servicesNode;

            foreach (var entry in servicesMap.Children)
            {
                var composeName = ((YamlScalarNode)entry.Key).Value!;
                var serviceNode = (YamlMappingNode)entry.Value;

                var def = new ComposeServiceDefinition { ComposeName = composeName };

                if (TryGetScalar(serviceNode, "image", out var image))
                    def.Image = image;

                if (serviceNode.Children.TryGetValue(new YamlScalarNode("build"), out var buildNode))
                {
                    if (buildNode is YamlScalarNode buildScalar)
                        def.BuildContext = buildScalar.Value;
                    else if (buildNode is YamlMappingNode buildMap && TryGetScalar(buildMap, "context", out var ctx))
                        def.BuildContext = ctx;
                }

                if (TryGetScalar(serviceNode, "container_name", out var containerName))
                    def.ContainerName = containerName;

                if (serviceNode.Children.TryGetValue(new YamlScalarNode("ports"), out var portsNode) && portsNode is YamlSequenceNode portsSeq)
                {
                    foreach (var port in portsSeq)
                    {
                        if (port is YamlScalarNode portScalar && portScalar.Value != null)
                            def.Ports.Add(Interpolate(portScalar.Value, globalEnv));
                    }
                }

                if (serviceNode.Children.TryGetValue(new YamlScalarNode("env_file"), out var envFileNode))
                {
                    if (envFileNode is YamlScalarNode envScalar && envScalar.Value != null)
                        def.EnvFiles.Add(envScalar.Value);
                    else if (envFileNode is YamlSequenceNode envSeq)
                    {
                        foreach (var ef in envSeq)
                        {
                            if (ef is YamlScalarNode efs && efs.Value != null)
                                def.EnvFiles.Add(efs.Value);
                        }
                    }
                }

                if (serviceNode.Children.TryGetValue(new YamlScalarNode("environment"), out var envNode))
                {
                    if (envNode is YamlMappingNode envMap)
                    {
                        foreach (var envEntry in envMap.Children)
                        {
                            var key = ((YamlScalarNode)envEntry.Key).Value!;
                            var val = envEntry.Value is YamlScalarNode vs ? (vs.Value ?? "") : "";
                            def.Environment[key] = Interpolate(val, globalEnv);
                        }
                    }
                    else if (envNode is YamlSequenceNode envSeqNode)
                    {
                        foreach (var item in envSeqNode)
                        {
                            if (item is YamlScalarNode itemScalar && itemScalar.Value != null)
                            {
                                var eqIdx = itemScalar.Value.IndexOf('=');
                                if (eqIdx > 0)
                                    def.Environment[itemScalar.Value[..eqIdx]] = itemScalar.Value[(eqIdx + 1)..];
                            }
                        }
                    }
                }

                if (serviceNode.Children.TryGetValue(new YamlScalarNode("volumes"), out var volNode) && volNode is YamlSequenceNode volSeq)
                {
                    foreach (var vol in volSeq)
                    {
                        if (vol is YamlScalarNode volScalar && volScalar.Value != null)
                            def.Volumes.Add(volScalar.Value);
                    }
                }

                if (serviceNode.Children.TryGetValue(new YamlScalarNode("depends_on"), out var depsNode))
                {
                    if (depsNode is YamlSequenceNode depsSeq)
                    {
                        foreach (var dep in depsSeq)
                        {
                            if (dep is YamlScalarNode depScalar && depScalar.Value != null)
                                def.DependsOn.Add(depScalar.Value);
                        }
                    }
                    else if (depsNode is YamlMappingNode depsMap)
                    {
                        foreach (var dep in depsMap.Children)
                            def.DependsOn.Add(((YamlScalarNode)dep.Key).Value!);
                    }
                }

                if (TryGetScalar(serviceNode, "restart", out var restart))
                    def.RestartPolicy = restart;

                if (TryGetScalar(serviceNode, "command", out var command))
                    def.Command = command;

                results.Add(def);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to parse {Path}", composePath);
        }

        return results;
    }

    private void AddRawPortMappings(string composePath, Dictionary<string, string> result)
    {
        if (!File.Exists(composePath)) return;

        try
        {
            var yaml = new YamlStream();
            using var reader = new StreamReader(composePath);
            yaml.Load(reader);

            var root = (YamlMappingNode)yaml.Documents[0].RootNode;
            if (!root.Children.TryGetValue(new YamlScalarNode("services"), out var servicesNode))
                return;

            var servicesMap = (YamlMappingNode)servicesNode;
            var regex = new Regex(@"\$\{(\w+)(?::-([\w]+))?\}");

            foreach (var entry in servicesMap.Children)
            {
                var composeName = ((YamlScalarNode)entry.Key).Value!;
                var serviceNode = (YamlMappingNode)entry.Value;

                if (serviceNode.Children.TryGetValue(new YamlScalarNode("ports"), out var portsNode) && portsNode is YamlSequenceNode portsSeq)
                {
                    foreach (var port in portsSeq)
                    {
                        if (port is YamlScalarNode portScalar && portScalar.Value != null)
                        {
                            var match = regex.Match(portScalar.Value);
                            if (match.Success)
                                result[match.Groups[1].Value] = composeName;
                        }
                    }
                }
            }
        }
        catch { }
    }

    private void AddHostPorts(List<ComposeServiceDefinition> defs, Dictionary<int, PortInfo> result)
    {
        foreach (var def in defs)
        {
            foreach (var portMapping in def.Ports)
            {
                var parsed = ParsePortMapping(portMapping);
                if (parsed != null)
                {
                    result[parsed.Value.hostPort] = new PortInfo(
                        def.ComposeName,
                        parsed.Value.hostPort,
                        parsed.Value.containerPort,
                        parsed.Value.protocol
                    );
                }
            }
        }
    }

    private static (int hostPort, int containerPort, string protocol)? ParsePortMapping(string mapping)
    {
        var protocol = "TCP";
        var slashIdx = mapping.IndexOf('/');
        if (slashIdx > 0)
        {
            protocol = mapping[(slashIdx + 1)..].Trim().ToUpper();
            mapping = mapping[..slashIdx];
        }

        mapping = mapping.Trim('"', '\'', ' ');
        var colonIdx = mapping.LastIndexOf(':');
        if (colonIdx <= 0) return null;

        var hostPart = mapping[..colonIdx];
        var containerPart = mapping[(colonIdx + 1)..];

        if (!int.TryParse(hostPart, out var hostPort)) return null;
        if (!int.TryParse(containerPart, out var containerPort)) return null;
        if (hostPort < 1 || hostPort > 65535) return null;

        return (hostPort, containerPort, protocol);
    }

    private Dictionary<string, string> LoadEnvFromDir(string dir)
    {
        var env = new Dictionary<string, string>();
        var envPath = Path.Combine(dir, ".env");
        if (!File.Exists(envPath)) return env;

        foreach (var line in File.ReadAllLines(envPath))
        {
            var trimmed = line.Trim();
            if (string.IsNullOrEmpty(trimmed) || trimmed.StartsWith('#')) continue;
            var eqIdx = trimmed.IndexOf('=');
            if (eqIdx <= 0) continue;
            env[trimmed[..eqIdx]] = trimmed[(eqIdx + 1)..];
        }
        return env;
    }

    private static string Interpolate(string value, Dictionary<string, string> env)
    {
        return Regex.Replace(value, @"\$\{(\w+)(?::-(.*?))?\}", match =>
        {
            var varName = match.Groups[1].Value;
            var defaultVal = match.Groups[2].Value;
            return env.TryGetValue(varName, out var val) ? val : defaultVal;
        });
    }

    private static bool TryGetScalar(YamlMappingNode node, string key, out string value)
    {
        value = "";
        if (node.Children.TryGetValue(new YamlScalarNode(key), out var child) && child is YamlScalarNode scalar && scalar.Value != null)
        {
            value = scalar.Value;
            return true;
        }
        return false;
    }
}
