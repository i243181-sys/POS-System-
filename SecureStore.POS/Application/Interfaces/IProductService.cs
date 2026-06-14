using SecureStore.POS.Application.DTOs;

namespace SecureStore.POS.Application.Interfaces;

public interface IProductService
{
    Task<IEnumerable<ProductDto>> GetAllProductsAsync();
    Task<ProductDto?> GetProductByIdAsync(int id);
    Task<ProductDto?> GetProductByBarcodeAsync(string barcode);
    Task<IEnumerable<ProductSearchResultDto>> SearchProductsAsync(string term, int maxResults = 20);
    Task<(bool success, string message, int productId)> CreateProductAsync(CreateProductDto dto, int createdByUserId);
    Task<(bool success, string message)> UpdateProductAsync(UpdateProductDto dto, int updatedByUserId);
    Task<(bool success, string message)> DeactivateProductAsync(int productId, int deletedByUserId);
    Task<(bool success, string message)> ActivateProductAsync(int productId, int activatedByUserId);
    Task<IEnumerable<ProductDto>> GetLowStockProductsAsync();
    Task<IEnumerable<Domain.Entities.Category>> GetCategoriesAsync();
}
