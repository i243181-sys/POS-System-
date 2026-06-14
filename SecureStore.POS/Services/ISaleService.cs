using SecureStore.POS.Domain.Entities;
using SecureStore.POS.Services.Requests;

namespace SecureStore.POS.Services;

public interface ISaleService
{
    Task<Sale> CompleteSaleAsync(SaleRequest request, int userId);
    Task<IEnumerable<Sale>> GetTodaySalesAsync();
    Task<IEnumerable<Sale>> GetSalesByDateRangeAsync(DateTime from, DateTime to);
    Task<decimal> GetTotalRevenueForDateAsync(DateTime date);
    Task<string> GenerateInvoiceNumberAsync();
}
