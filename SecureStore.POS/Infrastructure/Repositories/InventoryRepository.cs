using Microsoft.EntityFrameworkCore;
using SecureStore.POS.Domain.Entities;
using SecureStore.POS.Domain.Enums;
using SecureStore.POS.Infrastructure.Data;

namespace SecureStore.POS.Infrastructure.Repositories;

public interface IInventoryRepository : IRepository<InventoryTransaction>
{
    Task<IEnumerable<InventoryTransaction>> GetByProductAsync(int productId);
    Task<IEnumerable<InventoryTransaction>> GetByTypeAsync(TransactionType type);
}

public class InventoryRepository : Repository<InventoryTransaction>, IInventoryRepository
{
    public InventoryRepository(AppDbContext context) : base(context) { }

    public async Task<IEnumerable<InventoryTransaction>> GetByProductAsync(int productId) =>
        await _context.InventoryTransactions
            .Include(it => it.User)
            .Where(it => it.ProductID == productId)
            .OrderByDescending(it => it.CreatedAt)
            .ToListAsync();

    public async Task<IEnumerable<InventoryTransaction>> GetByTypeAsync(TransactionType type) =>
        await _context.InventoryTransactions
            .Include(it => it.Product)
            .Include(it => it.User)
            .Where(it => it.TransactionType == type)
            .OrderByDescending(it => it.CreatedAt)
            .ToListAsync();
}
