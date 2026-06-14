namespace SecureStore.POS.Domain.Entities;

public class Product
{
    public int ProductID { get; set; }
    public string ProductName { get; set; } = string.Empty;
    public string? Barcode { get; set; }
    public int CategoryID { get; set; }
    public string? Brand { get; set; }
    public decimal PurchasePrice { get; set; }
    public decimal SellingPrice { get; set; }
    public int StockQuantity { get; set; }
    public int ReorderLevel { get; set; } = 10;
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Category Category { get; set; } = null!;
    public ICollection<SaleItem> SaleItems { get; set; } = new List<SaleItem>();
    public ICollection<InventoryTransaction> InventoryTransactions { get; set; } = new List<InventoryTransaction>();
    public ICollection<ProductBackup> ProductBackups { get; set; } = new List<ProductBackup>();

    // Computed helper
    public bool IsLowStock => StockQuantity <= ReorderLevel;
}
