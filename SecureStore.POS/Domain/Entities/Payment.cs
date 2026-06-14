using SecureStore.POS.Domain.Enums;

namespace SecureStore.POS.Domain.Entities;

public class Payment
{
    public int PaymentID { get; set; }
    public int SaleID { get; set; }
    public PaymentMethod PaymentMethod { get; set; } = PaymentMethod.Cash;
    public decimal Amount { get; set; }
    public DateTime PaymentDate { get; set; } = DateTime.UtcNow;
    public string? ReferenceNo { get; set; } // For card/mobile — transaction ref only, never card data
    public string? Notes { get; set; }

    // Navigation
    public Sale Sale { get; set; } = null!;
}
