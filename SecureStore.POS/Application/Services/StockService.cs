using SecureStore.POS.Application.DTOs;
using SecureStore.POS.Application.Interfaces;
using SecureStore.POS.Domain.Entities;
using SecureStore.POS.Domain.Enums;
using SecureStore.POS.Infrastructure.UnitOfWork;

namespace SecureStore.POS.Application.Services;

public class StockService : IStockService
{
    private readonly IUnitOfWork _uow;
    private readonly IAuditService _audit;

    public StockService(IUnitOfWork uow, IAuditService audit)
    {
        _uow = uow;
        _audit = audit;
    }

    public async Task<(bool success, string message)> AdjustStockAsync(StockAdjustmentDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Reason))
            return (false, "A reason is required for stock adjustment.");
        var reason = dto.Reason.Trim();
        if (reason.Length > 500)
            return (false, "Stock adjustment reason must be 500 characters or fewer.");

        await using var transaction = await _uow.BeginTransactionAsync();
        try
        {
            var product = await _uow.Products.GetByIdAsync(dto.ProductID);
            if (product is null) return (false, "Product not found.");

            int oldStock = product.StockQuantity;
            int newStock = oldStock + dto.QuantityChange;

            if (newStock < 0)
                return (false, $"Adjustment would result in negative stock ({newStock}). Not allowed.");

            product.StockQuantity = newStock;
            product.UpdatedAt = DateTime.UtcNow;
            _uow.Products.Update(product);

            await _uow.Inventory.AddAsync(new InventoryTransaction
            {
                ProductID = product.ProductID,
                TransactionType = TransactionType.Adjustment,
                QuantityChange = dto.QuantityChange,
                OldStock = oldStock,
                NewStock = newStock,
                UserID = dto.UserID,
                Reason = reason,
                CreatedAt = DateTime.UtcNow
            });

            await _uow.SaveChangesAsync();
            await transaction.CommitAsync();

            await _audit.LogAsync("STOCK_ADJUSTED", "Product", dto.ProductID.ToString(),
                $"Stock for '{product.ProductName}' adjusted by {dto.QuantityChange:+#;-#;0}. " +
                $"Old: {oldStock}, New: {newStock}. Reason: {reason}", dto.UserID);

            return (true, $"Stock adjusted successfully. New stock: {newStock}");
        }
        catch (Exception ex)
        {
            try { await transaction.RollbackAsync(); } catch { }
            AppLogger.LogError(ex, "StockService.AdjustStockAsync");
            return (false, $"Stock adjustment failed: {ex.Message}");
        }
    }

    public async Task<IEnumerable<ProductDto>> GetLowStockProductsAsync()
    {
        var products = await _uow.Products.GetLowStockAsync();
        return products.Select(p => new ProductDto(
            p.ProductID, p.ProductName, p.Barcode, p.CategoryID,
            p.Category?.CategoryName ?? "", p.Brand,
            p.PurchasePrice, p.SellingPrice, p.StockQuantity,
            p.ReorderLevel, p.IsActive, p.IsLowStock,
            p.CreatedAt, p.UpdatedAt));
    }

    public async Task<IEnumerable<InventoryTransaction>> GetInventoryHistoryAsync(int productId) =>
        await _uow.Inventory.GetByProductAsync(productId);
}
