namespace SecureStore.POS.Domain.Entities;

public class SaleItem
{
    public int SaleItemID { get; set; }
    public int SaleID { get; set; }
    public int ProductID { get; set; }
    public string ProductName { get; set; } = string.Empty; // Snapshot at time of sale
    public int Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal UnitCost { get; set; }
    public decimal LineDiscount { get; set; }
    public decimal LineTotal { get; set; }

    // Navigation
    public Sale Sale { get; set; } = null!;
    public Product Product { get; set; } = null!;
}
