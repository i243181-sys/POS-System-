using SecureStore.POS.Domain.Entities;

namespace SecureStore.POS.Services;

public interface IProductService
{
    Task<IEnumerable<Product>> SearchAsync(string term);
    Task<Product?> GetByBarcodeAsync(string barcode);
    Task<Product?> GetByIdAsync(int productId);
    Task<IEnumerable<Product>> GetLowStockAsync();
    Task<IEnumerable<Product>> GetActiveProductsAsync();
    Task<IEnumerable<Category>> GetCategoriesAsync();
    Task AddProductAsync(Product product, int userId);
    Task UpdateProductAsync(Product product, int userId);
    Task DeactivateProductAsync(int productId, int userId);
    Task ActivateProductAsync(int productId, int userId);
}
