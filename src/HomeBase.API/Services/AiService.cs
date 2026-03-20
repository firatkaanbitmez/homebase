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

    public async Task<(bool enabled, string? apiKey, string model)> GetConfigAsync()
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var aiSettings = await db.Settings
            .Where(s => s.Section == "AI Configuration")
            .ToListAsync();

        var enabled = aiSettings.FirstOrDefault(s => s.Key == "AI_ENABLED")?.Value?.Equals("true", StringComparison.OrdinalIgnoreCase) ?? false;
        var apiKey = aiSettings.FirstOrDefault(s => s.Key == "OPENAI_API_KEY")?.Value;
        var model = aiSettings.FirstOrDefault(s => s.Key == "AI_MODEL")?.Value ?? "gpt-4.1-mini";

        return (enabled, apiKey, model);
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
        var (enabled, apiKey, model) = await GetConfigAsync();
        if (!enabled)
            throw new InvalidOperationException("AI feature is disabled");
        if (string.IsNullOrWhiteSpace(apiKey))
            throw new InvalidOperationException("OpenAI API key not configured");

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


        var requestBody = new
        {
            model = model,
            messages = new[]
            {
                new { role = "system", content = systemPrompt },
                new { role = "user", content = userPrompt.ToString() }
            },
            temperature = 0.3,
            max_tokens = 2000
        };

        var json = JsonSerializer.Serialize(requestBody);
        var request = new HttpRequestMessage(HttpMethod.Post, "https://api.openai.com/v1/chat/completions")
        {
            Content = new StringContent(json, Encoding.UTF8, "application/json")
        };
        request.Headers.Add("Authorization", $"Bearer {apiKey}");

        var response = await _http.SendAsync(request);
        var responseBody = await response.Content.ReadAsStringAsync();

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogError("OpenAI API error: {Status} - {Body}", response.StatusCode, responseBody);
            throw new InvalidOperationException($"OpenAI API error: {response.StatusCode}");
        }

        // Parse response
        using var doc = JsonDocument.Parse(responseBody);
        var content = doc.RootElement
            .GetProperty("choices")[0]
            .GetProperty("message")
            .GetProperty("content")
            .GetString();

        if (string.IsNullOrWhiteSpace(content))
            throw new InvalidOperationException("Empty response from AI");

        // Extract JSON from response (may be wrapped in markdown code block)
        var jsonContent = content.Trim();
        if (jsonContent.StartsWith("```"))
        {
            var startIdx = jsonContent.IndexOf('{');
            var endIdx = jsonContent.LastIndexOf('}');
            if (startIdx >= 0 && endIdx > startIdx)
                jsonContent = jsonContent[startIdx..(endIdx + 1)];
        }

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

public class ProjectScanResult
{
    public string Path { get; set; } = "";
    public List<string> Files { get; set; } = new();
    public List<string> MarkerFiles { get; set; } = new();
    public Dictionary<string, string> FileContents { get; set; } = new();
}
