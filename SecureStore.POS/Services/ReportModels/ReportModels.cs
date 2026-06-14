namespace SecureStore.POS.Services.ReportModels;

public class DailySalesSummary
{
    public DateTime Date { get; set; }
    public int TotalOrders { get; set; }
    public decimal TotalRevenue { get; set; }
    public decimal TotalNetSales { get; set; }
    public decimal OutstandingAmount { get; set; }
    public decimal TotalDiscount { get; set; }
}

public class ProductSalesSummary
{
    public string ProductName { get; set; } = string.Empty;
    public int QuantitySold { get; set; }
    public decimal TotalSales { get; set; }
}

public class CashierSalesSummary
{
    public string CashierName { get; set; } = string.Empty;
    public int SalesCount { get; set; }
    public decimal TotalRevenue { get; set; }
    public decimal TotalNetSales { get; set; }
    public decimal OutstandingAmount { get; set; }
}

public class LowStockProduct
{
    public string ProductName { get; set; } = string.Empty;
    public int StockQuantity { get; set; }
    public int ReorderLevel { get; set; }
    public string CategoryName { get; set; } = string.Empty;
}
