using Microsoft.EntityFrameworkCore;
using SecureStore.POS.Domain.Entities;
using SecureStore.POS.Infrastructure.Data;
using SecureStore.POS.Services.ReportModels;

namespace SecureStore.POS.Services;

public class ReportService : IReportService
{
    private readonly AppDbContext _context;

    public ReportService(AppDbContext context)
    {
        _context = context;
    }

    public async Task<DailySalesSummary> GetDailySalesSummaryAsync(DateTime date)
    {
        var start = date.Date;
        var end = start.AddDays(1);

        var sales = await _context.Sales
            .Where(s => s.SaleDate >= start && s.SaleDate < end && !s.IsVoided)
            .ToListAsync();

        return new DailySalesSummary
        {
            Date = start,
            TotalOrders = sales.Count,
            TotalRevenue = sales.Sum(s => s.PaidAmount - s.ChangeAmount),
            TotalNetSales = sales.Sum(s => s.NetTotal),
            OutstandingAmount = sales.Sum(s => Math.Max(0, s.NetTotal - (s.PaidAmount - s.ChangeAmount))),
            TotalDiscount = sales.Sum(s => s.DiscountAmount)
        };
    }

    public async Task<IEnumerable<ProductSalesSummary>> GetProductSalesAsync(DateTime from, DateTime to)
    {
        return await _context.SaleItems
            .Include(si => si.Sale)
            .Where(si => si.Sale.SaleDate >= from && si.Sale.SaleDate <= to && !si.Sale.IsVoided)
            .GroupBy(si => si.ProductName)
            .Select(g => new ProductSalesSummary
            {
                ProductName = g.Key,
                QuantitySold = g.Sum(si => si.Quantity),
                TotalSales = g.Sum(si => si.LineTotal)
            })
            .OrderByDescending(r => r.TotalSales)
            .ToListAsync();
    }

    public async Task<IEnumerable<CashierSalesSummary>> GetCashierSalesAsync(DateTime from, DateTime to)
    {
        return await _context.Sales
            .Include(s => s.User)
            .Where(s => s.SaleDate >= from && s.SaleDate <= to && !s.IsVoided)
            .GroupBy(s => new { s.UserID, s.User.FullName })
            .Select(g => new CashierSalesSummary
            {
                CashierName = g.Key.FullName,
                SalesCount = g.Count(),
                TotalRevenue = g.Sum(s => s.PaidAmount - s.ChangeAmount),
                TotalNetSales = g.Sum(s => s.NetTotal),
                OutstandingAmount = g.Sum(s =>
                    s.NetTotal > (s.PaidAmount - s.ChangeAmount)
                        ? s.NetTotal - (s.PaidAmount - s.ChangeAmount)
                        : 0m)
            })
            .OrderByDescending(r => r.TotalRevenue)
            .ToListAsync();
    }

    public async Task<IEnumerable<LowStockProduct>> GetLowStockAsync()
    {
        return await _context.Products
            .Where(p => p.IsActive && p.StockQuantity <= p.ReorderLevel)
            .Select(p => new LowStockProduct
            {
                ProductName = p.ProductName,
                StockQuantity = p.StockQuantity,
                ReorderLevel = p.ReorderLevel,
                CategoryName = p.Category.CategoryName
            })
            .OrderBy(p => p.StockQuantity)
            .ToListAsync();
    }
}
