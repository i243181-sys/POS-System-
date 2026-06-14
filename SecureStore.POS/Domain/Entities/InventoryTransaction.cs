using SecureStore.POS.Domain.Enums;

namespace SecureStore.POS.Domain.Entities;

public class InventoryTransaction
{
    public int InventoryTransactionID { get; set; }
    public int ProductID { get; set; }
    public TransactionType TransactionType { get; set; }
    public int QuantityChange { get; set; }   // Positive = stock in, Negative = stock out
    public int OldStock { get; set; }
    public int NewStock { get; set; }
    public int UserID { get; set; }
    public string Reason { get; set; } = string.Empty;
    public int? SaleID { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Product Product { get; set; } = null!;
    public User User { get; set; } = null!;
}
