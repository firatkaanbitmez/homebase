using HomeBase.API.Data;
using HomeBase.API.Models;
using Microsoft.EntityFrameworkCore;
using System.Text;
using System.Text.Json;

namespace HomeBase.API.Services;

public class AiService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<AiService> _logger;
    private readonly HttpClient _http;

    private static readonly string[] ProjectMarkers = {
        "package.json", "requirements.txt", "Pipfile", "pyproject.toml",
        "*.csproj", "go.mod", "Cargo.toml", "pom.xml", "build.gradle",
        "Dockerfile", "docker-compose.yml", "docker-compose.yaml",
        "appsettings.json", "appsettings.Development.json",
        "Program.cs", "Startup.cs",
        ".env", ".env.example", ".env.sample",
        "config.json", "config.yaml", "config.yml",
        "tsconfig.json", "next.config.js", "next.config.mjs",
        "vite.config.ts", "vite.config.js",
        "manage.py", "app.py", "main.py", "server.py",
        "main.go", "main.rs", "Gemfile"
    };

    public AiService(IServiceScopeFactory scopeFactory, ILogger<AiService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
        _http = new HttpClient { Timeout = TimeSpan.FromSeconds(60) };
    }

    public async Task<AiConfig> GetConfigAsync()
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var aiSettings = await db.Settings
            .Where(s => s.Section == "AI Configuration")
            .ToListAsync();

        var enabled = aiSettings.FirstOrDefault(s => s.Key == "AI_ENABLED")?.Value?.Equals("true", StringComparison.OrdinalIgnoreCase) ?? false;
        var apiKey = aiSettings.FirstOrDefault(s => s.Key == "AI_API_KEY")?.Value
                  ?? aiSettings.FirstOrDefault(s => s.Key == "OPENAI_API_KEY")?.Value;
        var model = aiSettings.FirstOrDefault(s => s.Key == "AI_MODEL")?.Value ?? "gpt-4.1-mini";
        var provider = aiSettings.FirstOrDefault(s => s.Key == "AI_PROVIDER")?.Value ?? "openai";
        var baseUrl = aiSettings.FirstOrDefault(s => s.Key == "AI_BASE_URL")?.Value ?? "";
        var maxTokensStr = aiSettings.FirstOrDefault(s => s.Key == "AI_MAX_TOKENS")?.Value;
        var maxTokens = int.TryParse(maxTokensStr, out var mt) ? mt : 4000;
        var maxAttemptsStr = aiSettings.FirstOrDefault(s => s.Key == "AI_MAX_ATTEMPTS")?.Value;
        var maxAttempts = int.TryParse(maxAttemptsStr, out var ma) ? ma : 3;

        return new AiConfig(enabled, apiKey, model, provider, baseUrl, maxTokens, maxAttempts);
    }

    private string GetEndpointUrl(string provider, string baseUrl)
    {
        return provider.ToLowerInvariant() switch
        {
            "gemini" => "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
            "claude" => "https://api.anthropic.com/v1/messages",
            "custom" => baseUrl,
            _ => "https://api.openai.com/v1/chat/completions" // openai default
        };
    }

    // Files to always read if found (relative to project root)
    private static readonly string[] DeepScanFiles = {
        "Dockerfile", "docker-compose.yml", "docker-compose.yaml",
        ".dockerignore", "entrypoint.sh", "start.sh",
        // Config / settings
        "package.json", "tsconfig.json",
        "requirements.txt", "Pipfile", "pyproject.toml", "setup.py",
        "go.mod", "Cargo.toml", "pom.xml", "build.gradle",
        ".env", ".env.example", ".env.sample", ".env.docker",
        "config.json", "config.yaml", "config.yml",
        // .NET
        "appsettings.json", "appsettings.Development.json", "appsettings.Docker.json",
        "appsettings.Production.json",
        "Properties/launchSettings.json",
        // JS/TS
        "next.config.js", "next.config.mjs", "vite.config.ts", "vite.config.js",
        "nuxt.config.ts", "angular.json",
        // Python
        "manage.py", "app.py", "main.py", "server.py", "wsgi.py", "asgi.py",
        // Go / Rust
        "main.go", "cmd/main.go", "main.rs", "src/main.rs",
        // Ruby
        "Gemfile", "config.ru",
    };

    // Glob patterns to find .csproj, Program.cs, etc. anywhere in tree
    private static readonly string[] DeepGlobPatterns = {
        "*.csproj", "Program.cs", "Startup.cs",
        "src/index.ts", "src/index.js", "src/main.ts", "src/main.py",
        "src/app.ts", "src/app.js", "src/server.ts", "src/server.js",
    };

    public ProjectScanResult ScanProject(string projectPath)
    {
        var result = new ProjectScanResult { Path = projectPath };
        if (!Directory.Exists(projectPath)) return result;

        // 1. List root directory
        foreach (var entry in Directory.GetFileSystemEntries(projectPath))
        {
            var name = Path.GetFileName(entry);
            if (name.StartsWith('.') && name != ".env" && name != ".env.example") continue;
            result.Files.Add(name);
        }

        // 2. Read all known important files
        int totalChars = 0;
        const int maxTotalChars = 30000; // Stay within AI context limits

        foreach (var relPath in DeepScanFiles)
        {
            if (totalChars >= maxTotalChars) break;
            var fullPath = Path.Combine(projectPath, relPath);
            if (!File.Exists(fullPath)) continue;
            try
            {
                var content = ReadFileLimited(fullPath, 300);
                if (!string.IsNullOrWhiteSpace(content))
                {
                    result.FileContents[relPath] = content;
                    result.MarkerFiles.Add(relPath);
                    totalChars += content.Length;
                }
            }
            catch { }
        }

        // 3. Deep glob: find .csproj, Program.cs etc. in subdirectories
        foreach (var pattern in DeepGlobPatterns)
        {
            if (totalChars >= maxTotalChars) break;
            try
            {
                var dir = Path.GetDirectoryName(pattern);
                var file = Path.GetFileName(pattern);
                var searchDir = string.IsNullOrEmpty(dir) ? projectPath : Path.Combine(projectPath, dir);
                if (!Directory.Exists(searchDir)) continue;

                var matches = Directory.GetFiles(searchDir, file, SearchOption.TopDirectoryOnly);
                foreach (var match in matches.Take(3))
                {
                    if (totalChars >= maxTotalChars) break;
                    var relName = Path.GetRelativePath(projectPath, match).Replace('\\', '/');
                    if (result.FileContents.ContainsKey(relName)) continue;
                    try
                    {
                        var content = ReadFileLimited(match, 200);
                        if (!string.IsNullOrWhiteSpace(content))
                        {
                            result.FileContents[relName] = content;
                            result.MarkerFiles.Add(relName);
                            totalChars += content.Length;
                        }
                    }
                    catch { }
                }
            }
            catch { }
        }

        // 4. Also search root for .csproj files (they may have any name)
        try
        {
            foreach (var csproj in Directory.GetFiles(projectPath, "*.csproj"))
            {
                var relName = Path.GetFileName(csproj);
                if (result.FileContents.ContainsKey(relName)) continue;
                try
                {
                    var content = ReadFileLimited(csproj, 200);
                    result.FileContents[relName] = content;
                    result.MarkerFiles.Add(relName);
                    totalChars += content.Length;
                }
                catch { }
            }
        }
        catch { }

        _logger.LogInformation("Scanned project {Path}: {Files} files, {Contents} contents ({Chars} chars)",
            projectPath, result.Files.Count, result.FileContents.Count, totalChars);

        return result;
    }

    private static string ReadFileLimited(string path, int maxLines)
    {
        var lines = File.ReadLines(path).Take(maxLines).ToList();
        return string.Join("\n", lines);
    }

    public async Task<AiAnalysisResult> AnalyzeProjectAsync(string projectPath)
    {
        var config = await GetConfigAsync();
        if (!config.Enabled)
            throw new InvalidOperationException("AI feature is disabled");
        if (string.IsNullOrWhiteSpace(config.ApiKey))
            throw new InvalidOperationException("AI API key not configured");

        var scan = ScanProject(projectPath);
        var projectName = Path.GetFileName(projectPath);

        // Build prompt
        var userPrompt = new StringBuilder();
        userPrompt.AppendLine($"Project name: {projectName}");
        userPrompt.AppendLine($"Project path: {projectPath}");
        userPrompt.AppendLine();
        userPrompt.AppendLine("Directory listing:");
        foreach (var file in scan.Files)
            userPrompt.AppendLine($"  {file}");
        userPrompt.AppendLine();

        if (scan.MarkerFiles.Count > 0)
        {
            userPrompt.AppendLine("Detected marker files:");
            foreach (var marker in scan.MarkerFiles)
                userPrompt.AppendLine($"  - {marker}");
            userPrompt.AppendLine();
        }

        foreach (var (fileName, fileContent) in scan.FileContents)
        {
            userPrompt.AppendLine($"=== {fileName} ===");
            userPrompt.AppendLine(fileContent);
            userPrompt.AppendLine();
        }

        // Get existing services from compose for context
        var existingServices = GetExistingComposeServices();
        var usedPorts = GetUsedPorts();
        var projectFolderName = Path.GetFileName(projectPath);

        // Detect if Dockerfile exists
        var hasDockerfile = scan.FileContents.ContainsKey("Dockerfile");
        var hasEntrypoint = scan.FileContents.ContainsKey("entrypoint.sh") || scan.FileContents.ContainsKey("start.sh");

        var systemPrompt = $@"You are a Docker Compose expert for the HomeBase dashboard. You MUST produce a 100% working configuration.

## INFRASTRUCTURE
- Compose project root: /app/project (inside container) mapped to host project directory
- PostgreSQL: service='postgres', container='homebase-db', internal port=5432, DB=homebase, User=homebase, Pass=pass123
- Existing services: {existingServices}
- Used host ports (AVOID these): {usedPorts}

## PROJECT INFO
- Folder name: {projectFolderName}
- Has Dockerfile: {(hasDockerfile ? "YES — use it, set dockerfile=null" : "NO — you MUST generate one")}
- Has entrypoint.sh: {(hasEntrypoint ? "YES" : "NO")}

## RETURN FORMAT
Return ONLY valid JSON (no markdown, no text before/after):
{{
  ""serviceName"": ""string"",
  ""image"": ""string or null"",
  ""buildContext"": ""string or null"",
  ""dockerfile"": ""string or null"",
  ""ports"": [{{""host"": int, ""container"": int}}],
  ""envVars"": {{""KEY"": ""value""}},
  ""volumes"": [""host:container""],
  ""dependsOn"": [""service-name""],
  ""explanation"": ""string""
}}

## RULES — READ EVERY ONE

### 1. Build vs Image (CRITICAL)
- Custom project with source code → image=null, buildContext=./{projectFolderName}
- Pre-built Docker image (redis, nginx, etc.) → buildContext=null, image=""xxx:latest""
- NEVER set both. NEVER set neither.

### 2. Dockerfile (CRITICAL)
- If project HAS a Dockerfile: set dockerfile=null (the existing one will be used)
- If project has NO Dockerfile: generate a COMPLETE working multi-stage Dockerfile
  - For .NET: FROM sdk AS build → restore → publish → FROM aspnet runtime → COPY --from=build
  - For Node.js: FROM node → COPY package*.json → npm install → COPY . → npm start
  - For Python: FROM python → COPY requirements.txt → pip install → COPY . → CMD
  - ALWAYS include EXPOSE with the correct port
  - ALWAYS include a proper CMD/ENTRYPOINT

### 3. Ports (CRITICAL)
- Read the project files to find the REAL port:
  - .NET: look at launchSettings.json applicationUrl, Program.cs UseUrls/Kestrel config, ASPNETCORE_URLS env. Common: 5000, 8080, 3000, 3005
  - Node.js: look for PORT in code, listen() calls. Common: 3000, 8080
  - Python: look for app.run(port=), uvicorn --port. Common: 5000, 8000
- Container port = the port the app actually listens on
- Host port = pick a UNIQUE port not in [{usedPorts}]
- If host port would collide, pick the next available (e.g. 3007, 3008...)

### 4. Database (CRITICAL)
- Check these for DB usage: appsettings.json (ConnectionStrings), .env (DATABASE_URL), requirements.txt (psycopg2, sqlalchemy), package.json (pg, prisma, sequelize, typeorm), *.csproj (Npgsql, EntityFramework)
- If project uses PostgreSQL: add ""postgres"" to dependsOn
- Connection string format by framework:
  - .NET: ""Host=homebase-db;Port=5432;Database={{serviceName}};Username=homebase;Password=pass123""
  - Node.js: ""postgresql://homebase:pass123@homebase-db:5432/{{serviceName}}""
  - Python: ""postgresql://homebase:pass123@homebase-db:5432/{{serviceName}}""
- Add the connection string as an envVar with the correct key name from the project's config

### 5. Volumes
- Persist data/config dirs: ./{projectFolderName}/data:/app/data, ./{projectFolderName}/config:/app/config
- If the project has specific paths it writes to (found in code), map them
- Check Dockerfile VOLUME directives and entrypoint.sh for clues

### 6. Environment Variables
- Include ALL env vars the app needs (check appsettings, .env.example, Dockerfile ENV, code references)
- For .NET: include ASPNETCORE_ENVIRONMENT=Docker if appsettings.Docker.json exists, else Production
- For Node.js: include NODE_ENV=production
- For secrets: generate reasonable defaults, don't leave empty";

        userPrompt.AppendLine();
        userPrompt.AppendLine("Analyze the above files carefully and return the JSON configuration. The service MUST start successfully on first try.");

        var content = await CallAiAsync(config, systemPrompt, userPrompt.ToString(), 0.3, Math.Min(config.MaxTokens, 2000));
        var jsonContent = ExtractJson(content);

        // Parse AI response
        using var aiDoc = JsonDocument.Parse(jsonContent);
        var root = aiDoc.RootElement;

        var serviceName = root.GetProperty("serviceName").GetString() ?? projectName.ToLower();
        var image = root.TryGetProperty("image", out var imgEl) && imgEl.ValueKind != JsonValueKind.Null
            ? imgEl.GetString() : null;
        var buildContext = root.TryGetProperty("buildContext", out var bcEl) && bcEl.ValueKind != JsonValueKind.Null
            ? bcEl.GetString() : null;
        var dockerfile = root.TryGetProperty("dockerfile", out var dfEl) && dfEl.ValueKind != JsonValueKind.Null
            ? dfEl.GetString() : null;
        var explanation = root.TryGetProperty("explanation", out var exEl)
            ? exEl.GetString() ?? "" : "";

        var ports = new List<AiPortMapping>();
        if (root.TryGetProperty("ports", out var portsEl))
        {
            foreach (var portEl in portsEl.EnumerateArray())
            {
                var host = portEl.GetProperty("host").GetInt32();
                var container = portEl.GetProperty("container").GetInt32();
                if (host is >= 1 and <= 65535 && container is >= 1 and <= 65535)
                    ports.Add(new AiPortMapping(host, container));
            }
        }

        var envVars = new Dictionary<string, string>();
        if (root.TryGetProperty("envVars", out var envEl))
        {
            foreach (var prop in envEl.EnumerateObject())
                envVars[prop.Name] = prop.Value.GetString() ?? "";
        }

        var volumes = new List<string>();
        if (root.TryGetProperty("volumes", out var volEl))
        {
            foreach (var v in volEl.EnumerateArray())
                volumes.Add(v.GetString() ?? "");
        }

        var dependsOn = new List<string>();
        if (root.TryGetProperty("dependsOn", out var depEl))
        {
            foreach (var d in depEl.EnumerateArray())
                dependsOn.Add(d.GetString() ?? "");
        }

        // Validate serviceName format
        serviceName = System.Text.RegularExpressions.Regex.Replace(serviceName.ToLower(), @"[^a-z0-9-]", "-");

        // Validate dockerfile has FROM if present
        if (dockerfile != null && !dockerfile.Contains("FROM", StringComparison.OrdinalIgnoreCase))
            dockerfile = null;

        return new AiAnalysisResult(
            serviceName, image, buildContext, dockerfile,
            ports, envVars, volumes, dependsOn, explanation
        );
    }

    public async Task<object> ModifyComposeAsync(string composeYaml, string instruction, string? imageName)
    {
        var config = await GetConfigAsync();
        if (!config.Enabled) throw new InvalidOperationException("AI feature is disabled");
        if (string.IsNullOrWhiteSpace(config.ApiKey)) throw new InvalidOperationException("AI API key not configured");

        var systemPrompt = @"You are a Docker Compose expert assistant for the HomeBase dashboard.
The user will give you a docker-compose.yml and an instruction to modify it.
You MUST return ONLY valid JSON in this exact format:
{""modifiedYaml"": ""the complete modified YAML"", ""explanation"": ""brief description of what changed""}
Rules:
- Apply the user's instruction to the YAML
- Keep the YAML valid and properly formatted
- Preserve all existing configuration unless the instruction says otherwise
- The modifiedYaml must be the COMPLETE file, not a diff
- Be compatible with HomeBase: keep networks, container_name, restart policy
- Return ONLY the JSON, no markdown, no text before/after";

        var userPrompt = $"Current docker-compose.yml:\n```yaml\n{composeYaml}\n```\n{(imageName != null ? $"\nImage: {imageName}" : "")}\n\nInstruction: {instruction}";

        try
        {
            var content = await CallAiAsync(config, systemPrompt, userPrompt, 0.2, 2000);
            var jsonContent = ExtractJson(content);
            using var aiDoc = JsonDocument.Parse(jsonContent);
            var root = aiDoc.RootElement;
            var modifiedYaml = root.TryGetProperty("modifiedYaml", out var yamlEl) ? yamlEl.GetString() : null;
            var explanation = root.TryGetProperty("explanation", out var expEl) ? expEl.GetString() : "";
            return new { modifiedYaml, explanation };
        }
        catch
        {
            return new { suggestions = "AI failed to modify compose" };
        }
    }

    /// Unified AI call helper — handles Claude vs OpenAI-compatible providers
    private async Task<string> CallAiAsync(AiConfig config, string systemPrompt, string userPrompt, double temperature = 0.2, int maxTokens = 3000)
    {
        var endpointUrl = GetEndpointUrl(config.Provider, config.BaseUrl);
        string content;

        if (config.Provider.Equals("claude", StringComparison.OrdinalIgnoreCase))
        {
            var requestBody = new { model = config.Model, system = systemPrompt,
                messages = new[] { new { role = "user", content = userPrompt } }, temperature, max_tokens = maxTokens };
            var json = JsonSerializer.Serialize(requestBody);
            var request = new HttpRequestMessage(HttpMethod.Post, endpointUrl)
            { Content = new StringContent(json, Encoding.UTF8, "application/json") };
            request.Headers.Add("x-api-key", config.ApiKey);
            request.Headers.Add("anthropic-version", "2023-06-01");
            var response = await _http.SendAsync(request);
            var body = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogError("AI API error: {Status} - {Body}", response.StatusCode, body);
                throw new InvalidOperationException($"AI API error: {response.StatusCode}");
            }
            using var doc = JsonDocument.Parse(body);
            content = doc.RootElement.GetProperty("content")[0].GetProperty("text").GetString() ?? "";
        }
        else
        {
            var requestBody = new { model = config.Model,
                messages = new[] { new { role = "system", content = systemPrompt }, new { role = "user", content = userPrompt } },
                temperature, max_tokens = maxTokens };
            var json = JsonSerializer.Serialize(requestBody);
            var request = new HttpRequestMessage(HttpMethod.Post, endpointUrl)
            { Content = new StringContent(json, Encoding.UTF8, "application/json") };
            request.Headers.Add("Authorization", $"Bearer {config.ApiKey}");
            var response = await _http.SendAsync(request);
            var body = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogError("AI API error: {Status} - {Body}", response.StatusCode, body);
                throw new InvalidOperationException($"AI API error: {response.StatusCode}");
            }
            using var doc = JsonDocument.Parse(body);
            content = doc.RootElement.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString() ?? "";
        }

        if (string.IsNullOrWhiteSpace(content))
            throw new InvalidOperationException("Empty response from AI");

        return content;
    }

    /// Extract JSON from AI response (may be wrapped in markdown code block)
    private static string ExtractJson(string content)
    {
        var jsonContent = content.Trim();
        if (jsonContent.StartsWith("```"))
        {
            var s = jsonContent.IndexOf('{');
            var e = jsonContent.LastIndexOf('}');
            if (s >= 0 && e > s) jsonContent = jsonContent[s..(e + 1)];
        }
        return jsonContent;
    }

    /// Agent-based deploy fix with chain-of-thought reasoning
    public async Task<AgentFixResponse> AgentFixAsync(DeployContext ctx, List<PreviousAttempt>? previousAttempts, string? userInstruction, string? language = null)
    {
        var config = await GetConfigAsync();
        if (!config.Enabled || string.IsNullOrWhiteSpace(config.ApiKey))
            return new AgentFixResponse("AI is not configured", null, null);

        var previousSection = "";
        if (previousAttempts != null && previousAttempts.Count > 0)
        {
            var sb = new StringBuilder();
            sb.AppendLine("\nThese fixes were already tried and FAILED — do NOT repeat them:");
            for (int i = 0; i < previousAttempts.Count; i++)
            {
                sb.AppendLine($"  Attempt {i + 1}: {previousAttempts[i].FixDescription}");
                if (!string.IsNullOrWhiteSpace(previousAttempts[i].ResultLogs))
                    sb.AppendLine($"    Result: {previousAttempts[i].ResultLogs}");
            }
            previousSection = sb.ToString();
        }

        var userInstrSection = !string.IsNullOrWhiteSpace(userInstruction)
            ? $"\nUser instruction: {userInstruction}" : "";

        var langInstruction = language?.ToLowerInvariant() == "tr"
            ? "\nIMPORTANT: You MUST respond in Turkish. All reasoning, descriptions, and userActionRequired text must be in Turkish."
            : "";

        var systemPrompt = $@"You are a Docker deployment troubleshooter. Analyze the failing container step by step.{langInstruction}

STEP 1 - ERROR: Read the container logs. What is the EXACT error? Quote it.
STEP 2 - COMPONENT: What module/package/service is failing?
STEP 3 - DEPENDENCIES: Check requirements.txt/package.json/go.mod. What packages are installed?
STEP 4 - ENVIRONMENT: Check docker-compose.yml environment variables. Are connection strings correct for the installed packages? (e.g., asyncpg needs postgresql+asyncpg://, not postgresql://)
STEP 5 - DOCKERFILE: Is the Dockerfile correct? WORKDIR, COPY, CMD?
STEP 6 - NETWORK: Check running containers and network. Can this container reach its dependencies?
STEP 7 - ROOT CAUSE: Based on steps 1-6, what is the root cause?
STEP 8 - FIX: What is the MINIMAL fix? Only modify compose, Dockerfile, or run infra commands. Do NOT modify project source files.

COMPOSE SAFETY: Copy the ENTIRE original, change ONLY the broken line. NEVER change paths, NEVER add services, NEVER remove name: key.

INFRA ACTIONS:
- Database creation: ""docker exec homebase-db psql -U homebase -c \""CREATE DATABASE ...;\""""
- The HomeBase system has a PostgreSQL container named 'homebase-db' with user 'homebase'.
{previousSection}{userInstrSection}

Return ONLY valid JSON (no markdown, no text before/after):
{{
  ""reasoning"": ""Step 1: [quote exact error] Step 2: ... Step 7: ROOT CAUSE: ..."",
  ""fix"": {{""type"": ""compose|dockerfile|infra"", ""content"": ""the COMPLETE fixed file or shell command"", ""description"": ""short description of what was changed""}},
  ""userActionRequired"": null
}}
If the issue requires project source file changes that cannot be worked around via compose/Dockerfile/infra, return:
{{
  ""reasoning"": ""Step 1: ... Step 7: ROOT CAUSE: ..."",
  ""fix"": null,
  ""userActionRequired"": ""You need to change X in Y because Z""
}}";

        // Build user prompt with all context
        var userPrompt = new StringBuilder();
        userPrompt.AppendLine($"Container: {ctx.ContainerName}");
        userPrompt.AppendLine($"\n=== docker-compose.yml ===\n{ctx.ComposeYaml}");
        if (!string.IsNullOrWhiteSpace(ctx.DockerfileContent))
            userPrompt.AppendLine($"\n=== Dockerfile ===\n{ctx.DockerfileContent}");
        userPrompt.AppendLine($"\n=== Container Logs (last 100 lines) ===\n{ctx.ContainerLogs}");
        if (!string.IsNullOrWhiteSpace(ctx.ContainerState))
            userPrompt.AppendLine($"\n=== Container State ===\n{ctx.ContainerState}");
        if (!string.IsNullOrWhiteSpace(ctx.ProjectFiles))
            userPrompt.AppendLine($"\n=== Project Files ===\n{ctx.ProjectFiles}");
        if (!string.IsNullOrWhiteSpace(ctx.DirectoryListing))
            userPrompt.AppendLine($"\n=== Directory Listing ===\n{ctx.DirectoryListing}");
        if (!string.IsNullOrWhiteSpace(ctx.NetworkInfo))
            userPrompt.AppendLine($"\n=== Docker Network ===\n{ctx.NetworkInfo}");
        if (!string.IsNullOrWhiteSpace(ctx.RunningContainers))
            userPrompt.AppendLine($"\n=== Running Containers ===\n{ctx.RunningContainers}");

        try
        {
            var raw = await CallAiAsync(config, systemPrompt, userPrompt.ToString(), 0.1, config.MaxTokens);
            var jsonContent = ExtractJson(raw);

            using var aiDoc = JsonDocument.Parse(jsonContent);
            var root = aiDoc.RootElement;

            var reasoning = root.TryGetProperty("reasoning", out var rEl) ? rEl.GetString() ?? "" : "";
            var userAction = root.TryGetProperty("userActionRequired", out var uaEl) && uaEl.ValueKind != JsonValueKind.Null
                ? uaEl.GetString() : null;

            AgentFix? fix = null;
            if (root.TryGetProperty("fix", out var fixEl) && fixEl.ValueKind != JsonValueKind.Null)
            {
                var type = fixEl.TryGetProperty("type", out var tEl) ? tEl.GetString() ?? "" : "";
                var content2 = fixEl.TryGetProperty("content", out var cEl) ? cEl.GetString() ?? "" : "";
                var desc = fixEl.TryGetProperty("description", out var dEl) ? dEl.GetString() ?? "" : "";
                if (!string.IsNullOrWhiteSpace(type) && !string.IsNullOrWhiteSpace(content2))
                    fix = new AgentFix(type, content2, desc);
            }

            return new AgentFixResponse(reasoning, fix, userAction);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Agent fix failed for {Container}", ctx.ContainerName);
            return new AgentFixResponse($"AI analysis failed: {ex.Message}", null, null);
        }
    }

    public async Task<string> AssistComposeAsync(string composeYaml, string? imageName)
    {
        var config = await GetConfigAsync();
        if (!config.Enabled) throw new InvalidOperationException("AI feature is disabled");
        if (string.IsNullOrWhiteSpace(config.ApiKey)) throw new InvalidOperationException("AI API key not configured");

        var systemPrompt = "You are a Docker Compose expert. Analyze the given docker-compose.yml content and provide improvement suggestions, best practices, and potential issues. Be concise and practical. Return plain text suggestions.";
        var userPrompt = $"Docker Compose YAML:\n```yaml\n{composeYaml}\n```\n{(imageName != null ? $"\nImage: {imageName}" : "")}\n\nProvide suggestions for improvements, security, and best practices.";

        return await CallAiAsync(config, systemPrompt, userPrompt, 0.3, 1500);
    }

    /// Detect the main user-facing URL path by analyzing project source code
    public async Task<string?> DetectUrlPathAsync(DeployContext ctx)
    {
        var config = await GetConfigAsync();
        if (!config.Enabled || string.IsNullOrWhiteSpace(config.ApiKey))
            return null;

        var systemPrompt = @"You are analyzing a web application's source code to find its main user-facing URL path.
The root path '/' returns 404. You need to find where the app serves its main UI or landing page.

Look for:
- FastAPI/Starlette: app.mount(), @app.get() decorators, static files mount paths
- Express/Node: app.use(), router paths, static middleware
- Django: urlpatterns, ROOT_URLCONF
- ASP.NET: MapFallbackToFile, UseStaticFiles, controller routes
- Spring: @RequestMapping, @GetMapping
- Any framework: static file serving paths, index.html locations, admin panels

Return ONLY a JSON object:
{""urlPath"": ""/the-path""}

If the app has no UI (pure API), return:
{""urlPath"": ""/docs""}

If you cannot determine the path, return:
{""urlPath"": null}

Return ONLY the JSON, nothing else.";

        var userPrompt = new StringBuilder();
        userPrompt.AppendLine($"Container: {ctx.ContainerName}");
        if (!string.IsNullOrWhiteSpace(ctx.ProjectFiles))
            userPrompt.AppendLine($"\n=== Project Files ===\n{ctx.ProjectFiles}");
        if (!string.IsNullOrWhiteSpace(ctx.DockerfileContent))
            userPrompt.AppendLine($"\n=== Dockerfile ===\n{ctx.DockerfileContent}");
        if (!string.IsNullOrWhiteSpace(ctx.DirectoryListing))
            userPrompt.AppendLine($"\n=== Directory Listing ===\n{ctx.DirectoryListing}");
        userPrompt.AppendLine($"\n=== docker-compose.yml ===\n{ctx.ComposeYaml}");

        try
        {
            var raw = await CallAiAsync(config, systemPrompt, userPrompt.ToString(), 0.1, 200);
            var json = ExtractJson(raw);
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            if (root.TryGetProperty("urlPath", out var pathEl) && pathEl.ValueKind == JsonValueKind.String)
                return pathEl.GetString();
            return null;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to detect URL path for {Container}", ctx.ContainerName);
            return null;
        }
    }

    private string GetExistingComposeServices()
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var services = db.Services.Select(s => new { s.Name, s.ContainerName, s.ComposeName }).ToList();
            if (services.Count == 0) return "- postgres (homebase-db)\n- dashboard (homebase-api)";
            return string.Join("\n", services.Select(s => $"- {s.ComposeName ?? s.ContainerName} ({s.ContainerName})"));
        }
        catch { return "- postgres (homebase-db)\n- dashboard (homebase-api)"; }
    }

    private string GetUsedPorts()
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var ports = db.Settings.Where(s => s.IsPortVariable)
                .Select(s => s.Value).ToList()
                .Where(v => int.TryParse(v, out _)).ToList();
            return ports.Count > 0 ? string.Join(", ", ports) : "3000, 5433";
        }
        catch { return "3000, 5433"; }
    }
}

public record AiConfig(bool Enabled, string? ApiKey, string Model, string Provider, string BaseUrl, int MaxTokens = 4000, int MaxAttempts = 3);

public record DeployContext(
    string ContainerName,
    string ComposeYaml,
    string? DockerfileContent,
    string ContainerLogs,
    string? ContainerState,
    string? ProjectFiles,
    string? DirectoryListing,
    string? NetworkInfo,
    string? RunningContainers
);

public class ProjectScanResult
{
    public string Path { get; set; } = "";
    public List<string> Files { get; set; } = new();
    public List<string> MarkerFiles { get; set; } = new();
    public Dictionary<string, string> FileContents { get; set; } = new();
}
