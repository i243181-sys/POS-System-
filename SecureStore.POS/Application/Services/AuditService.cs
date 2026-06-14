using SecureStore.POS.Application.Interfaces;
using SecureStore.POS.Domain.Entities;
using SecureStore.POS.Infrastructure.UnitOfWork;

namespace SecureStore.POS.Application.Services;

public class AuditService : IAuditService
{
    private readonly IUnitOfWork _uow;

    public AuditService(IUnitOfWork uow) => _uow = uow;

    public async Task LogAsync(string action, string entityName, string? entityId,
        string description, int? userId = null)
    {
        try
        {
            var log = new AuditLog
            {
                UserID = userId,
                Action = Clean(action, 100),
                EntityName = Clean(entityName, 100),
                EntityID = string.IsNullOrWhiteSpace(entityId) ? null : Clean(entityId, 50),
                Description = Clean(description, 1000),
                DeviceName = Environment.MachineName,
                CreatedAt = DateTime.UtcNow
            };
            await _uow.AuditLogs.AddAsync(log);
            await _uow.SaveChangesAsync();
        }
        catch (Exception ex)
        {
            // Audit logging must never crash the application
            AppLogger.LogError(ex, $"AuditService.LogAsync — failed to write audit log: {action}");
        }
    }

    public async Task<IEnumerable<AuditLog>> GetLogsAsync(DateTime from, DateTime to) =>
        await _uow.AuditLogs.GetByDateRangeAsync(from, to);

    private static string Clean(string value, int maxLength)
    {
        var cleaned = value
            .Replace('\r', ' ')
            .Replace('\n', ' ')
            .Trim();
        return cleaned.Length <= maxLength ? cleaned : cleaned[..maxLength];
    }
}
