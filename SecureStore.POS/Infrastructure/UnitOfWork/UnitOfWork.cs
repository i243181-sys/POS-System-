using System.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using SecureStore.POS.Infrastructure.Data;
using SecureStore.POS.Infrastructure.Repositories;

namespace SecureStore.POS.Infrastructure.UnitOfWork;

public class UnitOfWork : IUnitOfWork
{
    private readonly AppDbContext _context;
    private bool _disposed;

    public IUserRepository Users { get; }
    public IProductRepository Products { get; }
    public ISaleRepository Sales { get; }
    public IAuditLogRepository AuditLogs { get; }
    public IInventoryRepository Inventory { get; }
    public IRepository<Domain.Entities.SaleItem> SaleItems { get; }
    public IRepository<Domain.Entities.Payment> Payments { get; }
    public IRepository<Domain.Entities.Role> Roles { get; }
    public IRepository<Domain.Entities.Category> Categories { get; }
    public IRepository<Domain.Entities.Customer> Customers { get; }
    public IRepository<Domain.Entities.Setting> Settings { get; }
    public IRepository<Domain.Entities.BackupLog> BackupLogs { get; }

    public UnitOfWork(AppDbContext context)
    {
        _context = context;
        Users = new UserRepository(context);
        Products = new ProductRepository(context);
        Sales = new SaleRepository(context);
        AuditLogs = new AuditLogRepository(context);
        Inventory = new InventoryRepository(context);
        SaleItems = new Repository<Domain.Entities.SaleItem>(context);
        Payments = new Repository<Domain.Entities.Payment>(context);
        Roles = new Repository<Domain.Entities.Role>(context);
        Categories = new Repository<Domain.Entities.Category>(context);
        Customers = new Repository<Domain.Entities.Customer>(context);
        Settings = new Repository<Domain.Entities.Setting>(context);
        BackupLogs = new Repository<Domain.Entities.BackupLog>(context);
    }

    public async Task<int> SaveChangesAsync() => await _context.SaveChangesAsync();

    public async Task<IDbContextTransaction> BeginTransactionAsync() =>
        await _context.Database.BeginTransactionAsync(IsolationLevel.Serializable);

    protected virtual void Dispose(bool disposing)
    {
        if (!_disposed && disposing)
            _context.Dispose();
        _disposed = true;
    }

    public void Dispose()
    {
        Dispose(true);
        GC.SuppressFinalize(this);
    }
}
