using Microsoft.EntityFrameworkCore;
using SecureStore.POS.Domain.Entities;
using SecureStore.POS.Infrastructure.Data;

namespace SecureStore.POS.Infrastructure.Repositories;

public interface ISaleRepository : IRepository<Sale>
{
    Task<Sale?> GetWithDetailsAsync(int saleId);
    Task<Sale?> GetByInvoiceNumberAsync(string invoiceNumber);
    Task<IEnumerable<Sale>> GetByDateRangeAsync(DateTime from, DateTime to);
    Task<IEnumerable<Sale>> GetTodaySalesAsync();
    Task<decimal> GetTotalRevenueForDateAsync(DateTime date);
    Task<int> GetNextInvoiceSequenceAsync(string datePrefix);
}

public class SaleRepository : Repository<Sale>, ISaleRepository
{
    public SaleRepository(AppDbContext context) : base(context) { }

    public async Task<Sale?> GetWithDetailsAsync(int saleId) =>
        await _context.Sales
            .Include(s => s.User)
            .Include(s => s.Customer)
            .Include(s => s.SaleItems).ThenInclude(si => si.Product)
            .Include(s => s.Payments)
            .FirstOrDefaultAsync(s => s.SaleID == saleId);

    public async Task<Sale?> GetByInvoiceNumberAsync(string invoiceNumber) =>
        await _context.Sales
            .Include(s => s.SaleItems)
            .Include(s => s.Payments)
            .FirstOrDefaultAsync(s => s.InvoiceNumber == invoiceNumber);

    public async Task<IEnumerable<Sale>> GetByDateRangeAsync(DateTime from, DateTime to) =>
        await _context.Sales
            .Include(s => s.User)
            .Include(s => s.SaleItems)
            .Where(s => s.SaleDate >= from && s.SaleDate <= to && !s.IsVoided)
            .OrderByDescending(s => s.SaleDate)
            .ToListAsync();

    public async Task<IEnumerable<Sale>> GetTodaySalesAsync()
    {
        var todayUtc = DateTime.UtcNow.Date;
        var tomorrowUtc = todayUtc.AddDays(1);
        return await _context.Sales
            .Include(s => s.User)
            .Include(s => s.SaleItems)
            .Where(s => s.SaleDate >= todayUtc && s.SaleDate < tomorrowUtc && !s.IsVoided)
            .OrderByDescending(s => s.SaleDate)
            .ToListAsync();
    }

    public async Task<decimal> GetTotalRevenueForDateAsync(DateTime date)
    {
        var start = date.Date.ToUniversalTime();
        var end = start.AddDays(1);
        return await _context.Sales
            .Where(s => s.SaleDate >= start && s.SaleDate < end && !s.IsVoided)
            .SumAsync(s => (decimal?)(s.PaidAmount - s.ChangeAmount)) ?? 0m;
    }

    /// <summary>Gets the next sequence number for an invoice on a given date prefix (thread-safe via DB).</summary>
    public async Task<int> GetNextInvoiceSequenceAsync(string datePrefix)
    {
        var prefix = $"-{datePrefix}-";
        var count = await _context.Sales
            .CountAsync(s => s.InvoiceNumber.Contains(prefix));
        return count + 1;
    }
}
