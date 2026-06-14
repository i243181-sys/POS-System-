namespace SecureStore.POS.Application.DTOs;

public record DashboardDto(
    decimal TodayRevenue,
    int TodayTransactions,
    int TotalProducts,
    int LowStockCount,
    int TotalCustomers,
    string LoggedInUser,
    string UserRole,
    List<RecentSaleDto> RecentSales,
    List<LowStockItemDto> LowStockItems);

public record RecentSaleDto(
    string InvoiceNumber,
    string CashierName,
    DateTime SaleDate,
    decimal NetTotal);

public record LowStockItemDto(
    string ProductName,
    string CategoryName,
    int StockQuantity,
    int ReorderLevel);

public record DailySalesReportDto(
    DateTime Date,
    int TransactionCount,
    decimal TotalRevenue,
    decimal TotalDiscount,
    decimal TotalTax,
    decimal NetRevenue);

public record ProductSalesReportDto(
    int ProductID,
    string ProductName,
    string CategoryName,
    int TotalQuantitySold,
    decimal TotalRevenue,
    decimal TotalDiscount);

public record CashierSalesReportDto(
    int UserID,
    string CashierName,
    int TransactionCount,
    decimal TotalRevenue,
    decimal TotalDiscount);

public record DiscountReportDto(
    string InvoiceNumber,
    string CashierName,
    DateTime SaleDate,
    decimal SubTotal,
    decimal DiscountPercent,
    decimal DiscountAmount,
    decimal NetTotal);

public record StockAdjustmentDto(
    int ProductID,
    int QuantityChange,
    string Reason,
    int UserID);
