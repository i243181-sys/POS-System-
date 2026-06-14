using SecureStore.POS.Domain.Entities;
using SecureStore.POS.Infrastructure.UnitOfWork;

namespace SecureStore.POS.Services;

public class ProductService : IProductService
{
    private readonly IUnitOfWork _unitOfWork;
    private readonly IAuditService _auditService;

    public ProductService(IUnitOfWork unitOfWork, IAuditService auditService)
    {
        _unitOfWork = unitOfWork;
        _auditService = auditService;
    }

    public async Task<IEnumerable<Product>> SearchAsync(string term)
    {
        return await _unitOfWork.Products.SearchAsync(term);
    }

    public async Task<Product?> GetByBarcodeAsync(string barcode)
    {
        if (string.IsNullOrWhiteSpace(barcode)) return null;
        return await _unitOfWork.Products.GetByBarcodeAsync(barcode);
    }

    public async Task<Product?> GetByIdAsync(int productId) => await _unitOfWork.Products.GetByIdAsync(productId);

    public async Task<IEnumerable<Product>> GetLowStockAsync() => await _unitOfWork.Products.GetLowStockAsync();

    public async Task<IEnumerable<Product>> GetActiveProductsAsync() => await _unitOfWork.Products.GetAllActiveWithCategoryAsync();

    public async Task<IEnumerable<Category>> GetCategoriesAsync() => await _unitOfWork.Categories.GetAllAsync();

    public async Task AddProductAsync(Product product, int userId)
    {
        NormalizeProduct(product);
        ValidateProduct(product);
        await ValidateCategoryAsync(product.CategoryID);
        if (!string.IsNullOrWhiteSpace(product.Barcode) && await _unitOfWork.Products.ExistsAsync(p => p.Barcode == product.Barcode))
            throw new InvalidOperationException("Barcode already exists.");

        product.IsActive = true;
        await _unitOfWork.Products.AddAsync(product);
        await _unitOfWork.SaveChangesAsync();
        await _auditService.LogAsync(userId, "ProductAdded", "Product", product.ProductID.ToString(), $"Added product {product.ProductName}.");
    }

    public async Task UpdateProductAsync(Product product, int userId)
    {
        NormalizeProduct(product);
        ValidateProduct(product);
        await ValidateCategoryAsync(product.CategoryID);
        var existing = await _unitOfWork.Products.GetByIdAsync(product.ProductID);
        if (existing is null) throw new InvalidOperationException("Product not found.");
        if (!string.IsNullOrWhiteSpace(product.Barcode) && await _unitOfWork.Products.ExistsAsync(p => p.Barcode == product.Barcode && p.ProductID != product.ProductID))
            throw new InvalidOperationException("Barcode already exists.");

        existing.ProductName = product.ProductName;
        existing.Barcode = product.Barcode;
        existing.Brand = product.Brand;
        existing.CategoryID = product.CategoryID;
        existing.PurchasePrice = product.PurchasePrice;
        existing.SellingPrice = product.SellingPrice;
        existing.StockQuantity = product.StockQuantity;
        existing.ReorderLevel = product.ReorderLevel;
        existing.IsActive = product.IsActive;
        existing.UpdatedAt = DateTime.UtcNow;

        _unitOfWork.Products.Update(existing);
        await _unitOfWork.SaveChangesAsync();
        await _auditService.LogAsync(userId, "ProductUpdated", "Product", existing.ProductID.ToString(), $"Updated product {existing.ProductName}.");
    }

    public async Task DeactivateProductAsync(int productId, int userId)
    {
        var product = await _unitOfWork.Products.GetByIdAsync(productId);
        if (product is null) throw new InvalidOperationException("Product not found.");
        product.IsActive = false;
        product.UpdatedAt = DateTime.UtcNow;
        _unitOfWork.Products.Update(product);
        await _unitOfWork.SaveChangesAsync();
        await _auditService.LogAsync(userId, "ProductDeactivated", "Product", product.ProductID.ToString(), $"Deactivated product {product.ProductName}.");
    }

    public async Task ActivateProductAsync(int productId, int userId)
    {
        var product = await _unitOfWork.Products.GetByIdAsync(productId);
        if (product is null) throw new InvalidOperationException("Product not found.");
        ValidateProduct(product);

        var productName = product.ProductName.Trim().ToLower();
        var brand = (product.Brand ?? string.Empty).Trim().ToLower();
        var nameConflict = await _unitOfWork.Products.ExistsAsync(p =>
            p.ProductID != product.ProductID &&
            p.IsActive &&
            p.ProductName.ToLower() == productName &&
            ((p.Brand ?? string.Empty).ToLower()) == brand);
        if (nameConflict) throw new InvalidOperationException("Another active product already uses this name and brand.");

        if (!string.IsNullOrWhiteSpace(product.Barcode) &&
            await _unitOfWork.Products.ExistsAsync(p =>
                p.ProductID != product.ProductID &&
                p.IsActive &&
                p.Barcode == product.Barcode))
        {
            throw new InvalidOperationException("Barcode already exists on another active product.");
        }

        product.IsActive = true;
        product.UpdatedAt = DateTime.UtcNow;
        _unitOfWork.Products.Update(product);
        await _unitOfWork.SaveChangesAsync();
        await _auditService.LogAsync(userId, "ProductActivated", "Product", product.ProductID.ToString(), $"Activated product {product.ProductName}.");
    }

    private static void ValidateProduct(Product product)
    {
        if (product is null) throw new ArgumentNullException(nameof(product));
        if (string.IsNullOrWhiteSpace(product.ProductName)) throw new ArgumentException("Product name is required.", nameof(product.ProductName));
        if (product.ProductName.Length > 200) throw new ArgumentException("Product name cannot exceed 200 characters.", nameof(product.ProductName));
        if (product.Barcode?.Length > 100) throw new ArgumentException("Barcode cannot exceed 100 characters.", nameof(product.Barcode));
        if (product.Brand?.Length > 100) throw new ArgumentException("Brand cannot exceed 100 characters.", nameof(product.Brand));
        if (product.CategoryID <= 0) throw new ArgumentException("A category is required.", nameof(product.CategoryID));
        if (product.PurchasePrice < 0) throw new ArgumentException("Purchase price cannot be negative.", nameof(product.PurchasePrice));
        if (product.SellingPrice <= 0) throw new ArgumentException("Selling price must be greater than zero.", nameof(product.SellingPrice));
        if (product.StockQuantity < 0) throw new ArgumentException("Stock cannot be negative.", nameof(product.StockQuantity));
        if (product.ReorderLevel < 0) throw new ArgumentException("Reorder level cannot be negative.", nameof(product.ReorderLevel));
    }

    private static void NormalizeProduct(Product product)
    {
        if (product is null) return;
        product.ProductName = product.ProductName?.Trim() ?? string.Empty;
        product.Barcode = string.IsNullOrWhiteSpace(product.Barcode) ? null : product.Barcode.Trim();
        product.Brand = string.IsNullOrWhiteSpace(product.Brand) ? null : product.Brand.Trim();
    }

    private async Task ValidateCategoryAsync(int categoryId)
    {
        var category = await _unitOfWork.Categories.GetByIdAsync(categoryId);
        if (category is null || !category.IsActive)
            throw new InvalidOperationException("Select a valid active category.");
    }
}
