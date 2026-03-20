using HomeBase.API.Data;
using HomeBase.API.Models;
using HomeBase.API.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace HomeBase.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SystemController : ControllerBase
{
    private readonly SystemService _system;
    private readonly GpuService _gpu;
    private readonly AppDbContext _db;

    public SystemController(SystemService system, GpuService gpu, AppDbContext db)
    {
        _system = system;
        _gpu = gpu;
        _db = db;
    }

    [HttpGet("disks")]
    public IActionResult GetDisks() => Ok(_system.GetDisks());

    [HttpGet("gpu")]
    public async Task<IActionResult> GetGpu()
    {
        try { return Ok(await _gpu.GetGpuInfoAsync()); }
        catch { return Ok(new { available = false }); }
    }

    [HttpGet("logs")]
    public async Task<IActionResult> GetLogs(
        [FromQuery] string? action = null,
        [FromQuery] string? search = null,
        [FromQuery] DateTime? from = null,
        [FromQuery] DateTime? to = null,
        [FromQuery] int limit = 50,
        [FromQuery] int offset = 0)
    {
        var query = _db.AuditLogs.AsQueryable();

        if (!string.IsNullOrWhiteSpace(action))
            query = query.Where(l => l.Action == action);

        if (!string.IsNullOrWhiteSpace(search))
            query = query.Where(l => l.Target.Contains(search) || (l.Details != null && l.Details.Contains(search)));

        if (from.HasValue)
            query = query.Where(l => l.CreatedAt >= from.Value);

        if (to.HasValue)
            query = query.Where(l => l.CreatedAt <= to.Value.AddDays(1));

        var total = await query.CountAsync();

        var logs = await query
            .OrderByDescending(l => l.CreatedAt)
            .Skip(offset)
            .Take(Math.Min(limit, 200))
            .ToListAsync();

        return Ok(new { total, logs });
    }

    [HttpGet("icons")]
    public IActionResult GetIcons()
    {
        var webRoot = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "icons");
        if (!Directory.Exists(webRoot)) return Ok(Array.Empty<string>());
        var icons = Directory.GetFiles(webRoot)
            .Where(f => new[] { ".png", ".svg", ".ico", ".jpg", ".webp" }
                .Contains(Path.GetExtension(f).ToLower()))
            .Select(f => "/icons/" + Path.GetFileName(f))
            .OrderBy(f => f).ToList();
        return Ok(icons);
    }

    [HttpPost("icons/upload")]
    public async Task<IActionResult> UploadIcon(IFormFile file)
    {
        if (file == null || file.Length == 0)
            return BadRequest(new ApiError("NO_FILE", "No file provided"));

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        var allowed = new[] { ".png", ".svg", ".ico", ".jpg", ".webp" };
        if (!allowed.Contains(ext))
            return BadRequest(new ApiError("INVALID_TYPE", $"Allowed types: {string.Join(", ", allowed)}"));

        if (file.Length > 512 * 1024)
            return BadRequest(new ApiError("TOO_LARGE", "Max file size is 512KB"));

        var webRoot = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "icons");
        Directory.CreateDirectory(webRoot);

        // Sanitize filename
        var safeName = System.Text.RegularExpressions.Regex.Replace(
            Path.GetFileNameWithoutExtension(file.FileName).ToLowerInvariant(),
            @"[^a-z0-9_-]", "-") + ext;

        var filePath = Path.Combine(webRoot, safeName);
        await using var stream = new FileStream(filePath, FileMode.Create);
        await file.CopyToAsync(stream);

        return Ok(new { url = $"/icons/{safeName}" });
    }
}
