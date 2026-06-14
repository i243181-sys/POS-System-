using SecureStore.POS.Domain.Entities;

namespace SecureStore.POS.Services;

public interface IAuditService
{
    Task LogAsync(int? userId, string action, string entityName, string? entityId, string description);
    Task<IEnumerable<AuditLog>> GetRecentAsync(int count = 50);
}
