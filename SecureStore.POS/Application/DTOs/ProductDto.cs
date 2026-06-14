namespace SecureStore.POS.Application.DTOs;

public record ProductDto(
    int ProductID,
    string ProductName,
    string? Barcode,
    int CategoryID,
    string CategoryName,
    string? Brand,
    decimal PurchasePrice,
    decimal SellingPrice,
    int StockQuantity,
    int ReorderLevel,
    bool IsActive,
    bool IsLowStock,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public record CreateProductDto(
    string ProductName,
    string? Barcode,
    int CategoryID,
    string? Brand,
    decimal PurchasePrice,
    decimal SellingPrice,
    int StockQuantity,
    int ReorderLevel);

public record UpdateProductDto(
    int ProductID,
    string ProductName,
    string? Barcode,
    int CategoryID,
    string? Brand,
    decimal PurchasePrice,
    decimal SellingPrice,
    int StockQuantity,
    int ReorderLevel,
    bool IsActive);

public record ProductSearchResultDto(
    int ProductID,
    string ProductName,
    string? Barcode,
    string? Brand,
    string CategoryName,
    decimal SellingPrice,
    int StockQuantity);
