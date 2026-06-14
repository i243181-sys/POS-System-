using Microsoft.EntityFrameworkCore;
using SecureStore.POS.Domain.Entities;
using SecureStore.POS.Infrastructure.Data;

namespace SecureStore.POS.Infrastructure.Repositories;

public interface IAuditLogRepository : IRepository<AuditLog>
{
    Task<IEnumerable<AuditLog>> GetByDateRangeAsync(DateTime from, DateTime to);
    Task<IEnumerable<AuditLog>> GetByUserAsync(int userId);
    Task<IEnumerable<AuditLog>> GetByActionAsync(string action);
}

public class AuditLogRepository : Repository<AuditLog>, IAuditLogRepository
{
    public AuditLogRepository(AppDbContext context) : base(context) { }

    public async Task<IEnumerable<AuditLog>> GetByDateRangeAsync(DateTime from, DateTime to) =>
        await _context.AuditLogs
            .Include(al => al.User)
            .Where(al => al.CreatedAt >= from && al.CreatedAt <= to)
            .OrderByDescending(al => al.CreatedAt)
            .ToListAsync();

    public async Task<IEnumerable<AuditLog>> GetByUserAsync(int userId) =>
        await _context.AuditLogs
            .Where(al => al.UserID == userId)
            .OrderByDescending(al => al.CreatedAt)
            .ToListAsync();

    public async Task<IEnumerable<AuditLog>> GetByActionAsync(string action) =>
        await _context.AuditLogs
            .Include(al => al.User)
            .Where(al => al.Action == action)
            .OrderByDescending(al => al.CreatedAt)
            .ToListAsync();
}
