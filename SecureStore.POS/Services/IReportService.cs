using SecureStore.POS.Services.ReportModels;

namespace SecureStore.POS.Services;

public interface IReportService
{
    Task<DailySalesSummary> GetDailySalesSummaryAsync(DateTime date);
    Task<IEnumerable<ProductSalesSummary>> GetProductSalesAsync(DateTime from, DateTime to);
    Task<IEnumerable<CashierSalesSummary>> GetCashierSalesAsync(DateTime from, DateTime to);
    Task<IEnumerable<LowStockProduct>> GetLowStockAsync();
}
