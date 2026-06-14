using Microsoft.EntityFrameworkCore.Storage;
using SecureStore.POS.Infrastructure.Repositories;

namespace SecureStore.POS.Infrastructure.UnitOfWork;

/// <summary>
/// Unit of Work pattern — wraps the DbContext so all repositories in a 
/// single operation share one transaction and one SaveChanges call.
/// </summary>
public interface IUnitOfWork : IDisposable
{
    IUserRepository Users { get; }
    IProductRepository Products { get; }
    ISaleRepository Sales { get; }
    IAuditLogRepository AuditLogs { get; }
    IInventoryRepository Inventory { get; }
    IRepository<Domain.Entities.SaleItem> SaleItems { get; }
    IRepository<Domain.Entities.Payment> Payments { get; }
    IRepository<Domain.Entities.Role> Roles { get; }
    IRepository<Domain.Entities.Category> Categories { get; }
    IRepository<Domain.Entities.Customer> Customers { get; }
    IRepository<Domain.Entities.Setting> Settings { get; }
    IRepository<Domain.Entities.BackupLog> BackupLogs { get; }

    Task<int> SaveChangesAsync();
    Task<IDbContextTransaction> BeginTransactionAsync();
}
