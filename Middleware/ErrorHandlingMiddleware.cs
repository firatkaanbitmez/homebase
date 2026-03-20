using HomeBase.API.Models;
using System.Net;
using System.Text.Json;

namespace HomeBase.API.Middleware;

public class ErrorHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ErrorHandlingMiddleware> _logger;

    public ErrorHandlingMiddleware(RequestDelegate next, ILogger<ErrorHandlingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            var correlationId = Guid.NewGuid().ToString("N")[..8];
            _logger.LogError(ex, "Unhandled exception [{CorrelationId}]: {Message}", correlationId, ex.Message);

            context.Response.ContentType = "application/json";
            context.Response.StatusCode = ex switch
            {
                ArgumentException => (int)HttpStatusCode.BadRequest,
                KeyNotFoundException => (int)HttpStatusCode.NotFound,
                UnauthorizedAccessException => (int)HttpStatusCode.Forbidden,
                _ => (int)HttpStatusCode.InternalServerError
            };

            var error = new ApiError(
                Code: $"ERR_{context.Response.StatusCode}",
                Message: ex is ArgumentException or KeyNotFoundException
                    ? ex.Message
                    : "Bir hata olustu. Lutfen tekrar deneyin.",
                Detail: $"correlation:{correlationId}"
            );

            await context.Response.WriteAsync(JsonSerializer.Serialize(error, new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase
            }));
        }
    }
}
