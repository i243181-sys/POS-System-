using SecureStore.POS.Domain.Enums;

namespace SecureStore.POS.Domain.Entities;

public class Sale
{
    public int SaleID { get; set; }
    public string InvoiceNumber { get; set; } = string.Empty;
    public int UserID { get; set; }
    public int? CustomerID { get; set; }
    public DateTime SaleDate { get; set; } = DateTime.UtcNow;
    public decimal SubTotal { get; set; }
    public decimal DiscountAmount { get; set; }
    public decimal DiscountPercent { get; set; }
    public decimal TaxAmount { get; set; }
    public decimal NetTotal { get; set; }
    public decimal PaidAmount { get; set; }
    public decimal ChangeAmount { get; set; }
    public PaymentStatus PaymentStatus { get; set; } = PaymentStatus.Completed;
    public string? Notes { get; set; }
    public bool IsVoided { get; set; } = false;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public User User { get; set; } = null!;
    public Customer? Customer { get; set; }
    public ICollection<SaleItem> SaleItems { get; set; } = new List<SaleItem>();
    public ICollection<Payment> Payments { get; set; } = new List<Payment>();
}
