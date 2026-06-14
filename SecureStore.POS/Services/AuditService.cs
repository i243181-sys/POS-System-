using SecureStore.POS.Domain.Entities;
using SecureStore.POS.Infrastructure.UnitOfWork;

namespace SecureStore.POS.Services;

public class AuditService : IAuditService
{
    private readonly IUnitOfWork _unitOfWork;

    public AuditService(IUnitOfWork unitOfWork)
    {
        _unitOfWork = unitOfWork;
    }

    public async Task LogAsync(int? userId, string action, string entityName, string? entityId, string description)
    {
        var log = new AuditLog
        {
            UserID = userId,
            Action = Clean(action, 100),
            EntityName = Clean(entityName, 100),
            EntityID = string.IsNullOrWhiteSpace(entityId) ? null : Clean(entityId, 50),
            Description = Clean(description, 1000),
            DeviceName = Environment.MachineName,
            IpAddress = null
        };

        await _unitOfWork.AuditLogs.AddAsync(log);
        await _unitOfWork.SaveChangesAsync();
    }

    public async Task<IEnumerable<AuditLog>> GetRecentAsync(int count = 50)
    {
        return (await _unitOfWork.AuditLogs.FindAsync(_ => true))
            .OrderByDescending(log => log.CreatedAt)
            .Take(count);
    }

    private static string Clean(string value, int maxLength)
    {
        var cleaned = value
            .Replace('\r', ' ')
            .Replace('\n', ' ')
            .Trim();
        return cleaned.Length <= maxLength ? cleaned : cleaned[..maxLength];
    }
}
