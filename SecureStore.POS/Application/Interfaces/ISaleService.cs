using SecureStore.POS.Application.DTOs;

namespace SecureStore.POS.Application.Interfaces;

public interface ISaleService
{
    /// <summary>
    /// Executes the full sale in a single database transaction.
    /// Inserts Sale, SaleItems, Payment, reduces stock, logs inventory
    /// transactions, and writes audit log. Rolls back on any failure.
    /// </summary>
    Task<SaleResultDto> CompleteSaleAsync(CompleteSaleDto dto);
    Task<SaleDto?> GetSaleByIdAsync(int saleId);
    Task<SaleDto?> GetSaleByInvoiceAsync(string invoiceNumber);
    Task<IEnumerable<SaleDto>> GetTodaySalesAsync();
    Task<IEnumerable<SaleDto>> GetSalesByDateRangeAsync(DateTime from, DateTime to);
    Task<(bool success, string message)> VoidSaleAsync(int saleId, int adminUserId, string reason);
}
