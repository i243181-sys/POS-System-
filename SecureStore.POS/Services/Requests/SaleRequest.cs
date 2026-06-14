using SecureStore.POS.Domain.Enums;

namespace SecureStore.POS.Services.Requests;

public class SaleRequest
{
    public int UserID { get; set; }
    public int? CustomerID { get; set; }
    public decimal DiscountPercent { get; set; }
    public decimal DiscountAmount { get; set; }
    public decimal TaxPercent { get; set; }
    public decimal PaidAmount { get; set; }
    public PaymentMethod PaymentMethod { get; set; } = PaymentMethod.Cash;
    public string? ReferenceNo { get; set; }
    public string? CustomerAccountNumber { get; set; }
    public string? CustomerName { get; set; }
    public string? CustomerFatherName { get; set; }
    public string? CustomerPhone { get; set; }
    public string? CustomerEmail { get; set; }
    public IList<SaleItemRequest> Items { get; set; } = new List<SaleItemRequest>();
}
