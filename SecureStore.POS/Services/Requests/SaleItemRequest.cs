namespace SecureStore.POS.Services.Requests;

public class SaleItemRequest
{
    public int ProductID { get; set; }
    public string ProductName { get; set; } = string.Empty;
    public decimal UnitPrice { get; set; }
    public int Quantity { get; set; }
    public int StockQuantity { get; set; }
}
