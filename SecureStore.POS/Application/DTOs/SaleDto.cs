using SecureStore.POS.Domain.Enums;

namespace SecureStore.POS.Application.DTOs;

/// <summary>Represents one item in the active POS cart.</summary>
public class CartItemDto
{
    public int ProductID { get; set; }
    public string ProductName { get; set; } = string.Empty;
    public string? Barcode { get; set; }
    public decimal UnitPrice { get; set; }
    public int Quantity { get; set; }
    public decimal LineDiscount { get; set; }
    public int AvailableStock { get; set; }

    public decimal LineTotal => (UnitPrice * Quantity) - LineDiscount;
}

public record SaleItemDto(
    int ProductID,
    string ProductName,
    int Quantity,
    decimal UnitPrice,
    decimal LineDiscount,
    decimal LineTotal);

public record CompleteSaleDto(
    int UserID,
    int? CustomerID,
    List<CartItemDto> CartItems,
    decimal DiscountPercent,
    decimal DiscountAmount,
    decimal TaxPercent,
    decimal PaidAmount,
    PaymentMethod PaymentMethod,
    string? PaymentReference,
    string? Notes,
    string? CustomerAccountNumber = null,
    string? CustomerName = null,
    string? CustomerFatherName = null,
    string? CustomerPhone = null,
    string? CustomerEmail = null);

public record SaleResultDto(
    bool Success,
    string Message,
    int? SaleID,
    string? InvoiceNumber,
    decimal NetTotal,
    decimal ChangeAmount,
    decimal AmountDue = 0,
    string PaymentStatus = "Completed",
    int? CustomerID = null,
    string? CustomerAccountNumber = null);

public record SaleDto(
    int SaleID,
    string InvoiceNumber,
    string CashierName,
    DateTime SaleDate,
    decimal SubTotal,
    decimal DiscountAmount,
    decimal DiscountPercent,
    decimal TaxAmount,
    decimal NetTotal,
    decimal PaidAmount,
    decimal ChangeAmount,
    string PaymentStatus,
    bool IsVoided,
    List<SaleItemDto> Items);
