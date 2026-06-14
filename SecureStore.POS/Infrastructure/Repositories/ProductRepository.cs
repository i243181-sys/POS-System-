using Microsoft.EntityFrameworkCore;
using SecureStore.POS.Domain.Entities;
using SecureStore.POS.Infrastructure.Data;

namespace SecureStore.POS.Infrastructure.Repositories;

public interface IProductRepository : IRepository<Product>
{
    Task<IEnumerable<Product>> SearchAsync(string term, int maxResults = 20);
    Task<Product?> GetByBarcodeAsync(string barcode);
    Task<IEnumerable<Product>> GetLowStockAsync();
    Task<IEnumerable<Product>> GetByCategoryAsync(int categoryId);
    Task<IEnumerable<Product>> GetAllActiveWithCategoryAsync();
    Task<IEnumerable<Product>> GetByIdsAsync(IEnumerable<int> productIds);
}

public class ProductRepository : Repository<Product>, IProductRepository
{
    public ProductRepository(AppDbContext context) : base(context) { }

    /// <summary>
    /// Fast autocomplete search — searches ProductName, Brand, and Barcode.
    /// Uses EF Core LIKE queries which translate to indexed SQL LIKE.
    /// Supports 1000+ products efficiently due to indexed ProductName column.
    /// </summary>
    public async Task<IEnumerable<Product>> SearchAsync(string term, int maxResults = 20)
    {
        if (string.IsNullOrWhiteSpace(term)) return [];

        var lower = term.Trim().ToLower();

        return await _context.Products
            .Include(p => p.Category)
            .Where(p => p.IsActive && (
                p.ProductName.ToLower().Contains(lower) ||
                (p.Brand != null && p.Brand.ToLower().Contains(lower)) ||
                (p.Barcode != null && p.Barcode.Contains(lower))))
            .OrderBy(p => p.ProductName)
            .Take(maxResults)
            .ToListAsync();
    }

    public async Task<Product?> GetByBarcodeAsync(string barcode) =>
        await _context.Products
            .Include(p => p.Category)
            .FirstOrDefaultAsync(p => p.Barcode == barcode && p.IsActive);

    public async Task<IEnumerable<Product>> GetLowStockAsync() =>
        await _context.Products
            .Include(p => p.Category)
            .Where(p => p.IsActive && p.StockQuantity <= p.ReorderLevel)
            .OrderBy(p => p.StockQuantity)
            .ToListAsync();

    public async Task<IEnumerable<Product>> GetByCategoryAsync(int categoryId) =>
        await _context.Products
            .Where(p => p.CategoryID == categoryId && p.IsActive)
            .OrderBy(p => p.ProductName)
            .ToListAsync();

    public async Task<IEnumerable<Product>> GetAllActiveWithCategoryAsync() =>
        await _context.Products
            .Include(p => p.Category)
            .Where(p => p.IsActive)
            .OrderBy(p => p.ProductName)
            .ToListAsync();

    public async Task<IEnumerable<Product>> GetByIdsAsync(IEnumerable<int> productIds) =>
        await _context.Products
            .Where(p => productIds.Contains(p.ProductID) && p.IsActive)
            .ToListAsync();
}
