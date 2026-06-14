using SecureStore.POS.Application.DTOs;
using SecureStore.POS.Application.Interfaces;
using SecureStore.POS.Domain.Entities;
using SecureStore.POS.Infrastructure.UnitOfWork;

namespace SecureStore.POS.Application.Services;

public class ProductService : IProductService
{
    private readonly IUnitOfWork _uow;
    private readonly IAuditService _audit;

    public ProductService(IUnitOfWork uow, IAuditService audit)
    {
        _uow = uow;
        _audit = audit;
    }

    public async Task<IEnumerable<ProductDto>> GetAllProductsAsync()
    {
        var products = await _uow.Products.GetAllActiveWithCategoryAsync();
        return products.Select(MapToDto);
    }

    public async Task<ProductDto?> GetProductByIdAsync(int id)
    {
        var p = await _uow.Products.GetByIdAsync(id);
        return p is null ? null : MapToDto(p);
    }

    public async Task<ProductDto?> GetProductByBarcodeAsync(string barcode)
    {
        var p = await _uow.Products.GetByBarcodeAsync(barcode);
        return p is null ? null : MapToDto(p);
    }

    public async Task<IEnumerable<ProductSearchResultDto>> SearchProductsAsync(string term, int maxResults = 20)
    {
        var results = await _uow.Products.SearchAsync(term, maxResults);
        return results.Select(p => new ProductSearchResultDto(
            p.ProductID, p.ProductName, p.Barcode, p.Brand,
            p.Category?.CategoryName ?? "", p.SellingPrice, p.StockQuantity));
    }

    public async Task<(bool success, string message, int productId)> CreateProductAsync(
        CreateProductDto dto, int createdByUserId)
    {
        try
        {
            var productName = dto.ProductName?.Trim() ?? string.Empty;
            var barcode = string.IsNullOrWhiteSpace(dto.Barcode) ? null : dto.Barcode.Trim();
            var brand = string.IsNullOrWhiteSpace(dto.Brand) ? null : dto.Brand.Trim();

            if (string.IsNullOrWhiteSpace(productName))
                return (false, "Product name is required.", 0);
            if (productName.Length > 200)
                return (false, "Product name cannot exceed 200 characters.", 0);
            if (barcode?.Length > 100)
                return (false, "Barcode cannot exceed 100 characters.", 0);
            if (brand?.Length > 100)
                return (false, "Brand cannot exceed 100 characters.", 0);
            if (dto.SellingPrice <= 0)
                return (false, "Selling price must be greater than 0.", 0);
            if (dto.StockQuantity < 0)
                return (false, "Stock quantity cannot be negative.", 0);
            if (dto.PurchasePrice < 0)
                return (false, "Purchase price cannot be negative.", 0);
            if (dto.ReorderLevel < 0)
                return (false, "Reorder level cannot be negative.", 0);

            var category = await _uow.Categories.GetByIdAsync(dto.CategoryID);
            if (category is null || !category.IsActive)
                return (false, "Select a valid active category.", 0);

            // Barcode uniqueness check
            if (!string.IsNullOrWhiteSpace(barcode))
            {
                var existing = await _uow.Products.ExistsAsync(
                    p => p.Barcode == barcode && p.IsActive);
                if (existing)
                    return (false, $"Barcode '{barcode}' is already assigned to another product.", 0);
            }

            var product = new Product
            {
                ProductName = productName,
                Barcode = barcode,
                CategoryID = dto.CategoryID,
                Brand = brand,
                PurchasePrice = dto.PurchasePrice,
                SellingPrice = dto.SellingPrice,
                StockQuantity = dto.StockQuantity,
                ReorderLevel = dto.ReorderLevel,
                IsActive = true,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            await _uow.Products.AddAsync(product);
            await _uow.SaveChangesAsync();

            await _audit.LogAsync("PRODUCT_CREATED", "Product", product.ProductID.ToString(),
                $"Product '{product.ProductName}' created with stock={product.StockQuantity}.",
                createdByUserId);

            return (true, "Product created successfully.", product.ProductID);
        }
        catch (Exception ex)
        {
            AppLogger.LogError(ex, "ProductService.CreateProductAsync");
            return (false, "Failed to create product. Please try again.", 0);
        }
    }

    public async Task<(bool success, string message)> UpdateProductAsync(
        UpdateProductDto dto, int updatedByUserId)
    {
        try
        {
            var product = await _uow.Products.GetByIdAsync(dto.ProductID);
            if (product is null) return (false, "Product not found.");

            var productName = dto.ProductName?.Trim() ?? string.Empty;
            var barcode = string.IsNullOrWhiteSpace(dto.Barcode) ? null : dto.Barcode.Trim();
            var brand = string.IsNullOrWhiteSpace(dto.Brand) ? null : dto.Brand.Trim();

            if (string.IsNullOrWhiteSpace(productName))
                return (false, "Product name is required.");
            if (productName.Length > 200)
                return (false, "Product name cannot exceed 200 characters.");
            if (barcode?.Length > 100)
                return (false, "Barcode cannot exceed 100 characters.");
            if (brand?.Length > 100)
                return (false, "Brand cannot exceed 100 characters.");
            if (dto.SellingPrice <= 0)
                return (false, "Selling price must be greater than 0.");
            if (dto.StockQuantity < 0)
                return (false, "Stock quantity cannot be negative.");
            if (dto.PurchasePrice < 0)
                return (false, "Purchase price cannot be negative.");
            if (dto.ReorderLevel < 0)
                return (false, "Reorder level cannot be negative.");

            var category = await _uow.Categories.GetByIdAsync(dto.CategoryID);
            if (category is null || !category.IsActive)
                return (false, "Select a valid active category.");

            // Barcode uniqueness (exclude self)
            if (!string.IsNullOrWhiteSpace(barcode))
            {
                var conflict = await _uow.Products.ExistsAsync(
                    p => p.Barcode == barcode && p.ProductID != dto.ProductID && p.IsActive);
                if (conflict)
                    return (false, $"Barcode '{barcode}' is already in use by another product.");
            }

            product.ProductName = productName;
            product.Barcode = barcode;
            product.CategoryID = dto.CategoryID;
            product.Brand = brand;
            product.PurchasePrice = dto.PurchasePrice;
            product.SellingPrice = dto.SellingPrice;
            product.StockQuantity = dto.StockQuantity;
            product.ReorderLevel = dto.ReorderLevel;
            product.IsActive = dto.IsActive;
            product.UpdatedAt = DateTime.UtcNow;

            _uow.Products.Update(product);
            await _uow.SaveChangesAsync();

            await _audit.LogAsync("PRODUCT_UPDATED", "Product", product.ProductID.ToString(),
                $"Product '{product.ProductName}' updated.", updatedByUserId);

            return (true, "Product updated successfully.");
        }
        catch (Exception ex)
        {
            AppLogger.LogError(ex, "ProductService.UpdateProductAsync");
            return (false, "Failed to update product.");
        }
    }

    public async Task<(bool success, string message)> DeactivateProductAsync(
        int productId, int deletedByUserId)
    {
        var product = await _uow.Products.GetByIdAsync(productId);
        if (product is null) return (false, "Product not found.");

        product.IsActive = false;
        product.UpdatedAt = DateTime.UtcNow;
        _uow.Products.Update(product);
        await _uow.SaveChangesAsync();

        await _audit.LogAsync("PRODUCT_DEACTIVATED", "Product", productId.ToString(),
            $"Product '{product.ProductName}' deactivated.", deletedByUserId);

        return (true, "Product deactivated successfully.");
    }

    public async Task<(bool success, string message)> ActivateProductAsync(
        int productId, int activatedByUserId)
    {
        var product = await _uow.Products.GetByIdAsync(productId);
        if (product is null) return (false, "Product not found.");
        if (product.IsActive) return (true, "Product is already active.");
        if (product.SellingPrice <= 0) return (false, "Set a valid selling price before activating this product.");
        if (product.StockQuantity < 0) return (false, "Product stock is invalid.");

        var productName = product.ProductName.Trim().ToLower();
        var brand = (product.Brand ?? string.Empty).Trim().ToLower();
        var nameConflict = await _uow.Products.ExistsAsync(p =>
            p.ProductID != product.ProductID &&
            p.IsActive &&
            p.ProductName.ToLower() == productName &&
            ((p.Brand ?? string.Empty).ToLower()) == brand);
        if (nameConflict)
            return (false, "Another active product already uses this name and brand.");

        if (!string.IsNullOrWhiteSpace(product.Barcode))
        {
            var barcodeConflict = await _uow.Products.ExistsAsync(p =>
                p.ProductID != product.ProductID &&
                p.IsActive &&
                p.Barcode == product.Barcode);
            if (barcodeConflict)
                return (false, "Barcode already exists on another active product.");
        }

        product.IsActive = true;
        product.UpdatedAt = DateTime.UtcNow;
        _uow.Products.Update(product);
        await _uow.SaveChangesAsync();

        await _audit.LogAsync("PRODUCT_ACTIVATED", "Product", productId.ToString(),
            $"Product '{product.ProductName}' activated.", activatedByUserId);

        return (true, "Product activated successfully.");
    }

    public async Task<IEnumerable<ProductDto>> GetLowStockProductsAsync()
    {
        var products = await _uow.Products.GetLowStockAsync();
        return products.Select(MapToDto);
    }

    public async Task<IEnumerable<Domain.Entities.Category>> GetCategoriesAsync() =>
        await _uow.Categories.GetAllAsync();

    private static ProductDto MapToDto(Product p) => new(
        p.ProductID, p.ProductName, p.Barcode, p.CategoryID,
        p.Category?.CategoryName ?? "", p.Brand,
        p.PurchasePrice, p.SellingPrice, p.StockQuantity,
        p.ReorderLevel, p.IsActive, p.IsLowStock,
        p.CreatedAt, p.UpdatedAt);
}
