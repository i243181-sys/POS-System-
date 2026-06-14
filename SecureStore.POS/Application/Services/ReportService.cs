using Microsoft.EntityFrameworkCore;
using SecureStore.POS.Application.DTOs;
using SecureStore.POS.Application.Interfaces;
using SecureStore.POS.Infrastructure.Data;
using SecureStore.POS.Infrastructure.UnitOfWork;
using SecureStore.POS.Security;

namespace SecureStore.POS.Application.Services;

public class ReportService : IReportService
{
    private readonly IUnitOfWork _uow;
    private readonly AppDbContext _context;

    public ReportService(IUnitOfWork uow, AppDbContext context)
    {
        _uow = uow;
        _context = context;
    }

    public async Task<DashboardDto> GetDashboardDataAsync(int userId)
    {
        var todaySales = await _uow.Sales.GetTodaySalesAsync();
        var salesList = todaySales.ToList();
        var todayRevenue = salesList.Sum(s => s.PaidAmount - s.ChangeAmount);
        var totalProducts = await _uow.Products.CountAsync(p => p.IsActive);
        var lowStockProducts = await _uow.Products.GetLowStockAsync();
        var totalCustomers = await _uow.Customers.CountAsync(c => c.IsActive);
        var user = SessionManager.Instance.CurrentUser;

        var recentSales = salesList.Take(5).Select(s => new RecentSaleDto(
            s.InvoiceNumber,
            s.User?.FullName ?? "Unknown",
            s.SaleDate,
            s.NetTotal)).ToList();

        var lowStockItems = lowStockProducts.Take(10).Select(p => new LowStockItemDto(
            p.ProductName,
            p.Category?.CategoryName ?? "",
            p.StockQuantity,
            p.ReorderLevel)).ToList();

        return new DashboardDto(
            todayRevenue,
            salesList.Count,
            totalProducts,
            lowStockProducts.Count(),
            totalCustomers,
            user?.FullName ?? "Unknown",
            user?.Role?.RoleName ?? "",
            recentSales,
            lowStockItems);
    }

    public async Task<IEnumerable<DailySalesReportDto>> GetDailySalesReportAsync(DateTime from, DateTime to)
    {
        var fromUtc = from.Date.ToUniversalTime();
        var toUtc = to.Date.AddDays(1).ToUniversalTime();

        var result = await _context.Sales
            .Where(s => s.SaleDate >= fromUtc && s.SaleDate < toUtc && !s.IsVoided)
            .GroupBy(s => s.SaleDate.Date)
            .Select(g => new DailySalesReportDto(
                g.Key,
                g.Count(),
                g.Sum(s => s.PaidAmount - s.ChangeAmount),
                g.Sum(s => s.DiscountAmount),
                g.Sum(s => s.TaxAmount),
                g.Sum(s => s.NetTotal)))
            .OrderBy(r => r.Date)
            .ToListAsync();

        return result;
    }

    public async Task<IEnumerable<ProductSalesReportDto>> GetProductSalesReportAsync(DateTime from, DateTime to)
    {
        var fromUtc = from.Date.ToUniversalTime();
        var toUtc = to.Date.AddDays(1).ToUniversalTime();

        return await _context.SaleItems
            .Include(si => si.Sale)
            .Include(si => si.Product).ThenInclude(p => p.Category)
            .Where(si => si.Sale.SaleDate >= fromUtc && si.Sale.SaleDate < toUtc && !si.Sale.IsVoided)
            .GroupBy(si => new { si.ProductID, si.ProductName, CategoryName = si.Product.Category.CategoryName })
            .Select(g => new ProductSalesReportDto(
                g.Key.ProductID,
                g.Key.ProductName,
                g.Key.CategoryName,
                g.Sum(si => si.Quantity),
                g.Sum(si => si.LineTotal),
                g.Sum(si => si.LineDiscount)))
            .OrderByDescending(r => r.TotalRevenue)
            .ToListAsync();
    }

    public async Task<IEnumerable<CashierSalesReportDto>> GetCashierSalesReportAsync(DateTime from, DateTime to)
    {
        var fromUtc = from.Date.ToUniversalTime();
        var toUtc = to.Date.AddDays(1).ToUniversalTime();

        return await _context.Sales
            .Include(s => s.User)
            .Where(s => s.SaleDate >= fromUtc && s.SaleDate < toUtc && !s.IsVoided)
            .GroupBy(s => new { s.UserID, s.User.FullName })
            .Select(g => new CashierSalesReportDto(
                g.Key.UserID,
                g.Key.FullName,
                g.Count(),
                g.Sum(s => s.PaidAmount - s.ChangeAmount),
                g.Sum(s => s.DiscountAmount)))
            .OrderByDescending(r => r.TotalRevenue)
            .ToListAsync();
    }

    public async Task<IEnumerable<DiscountReportDto>> GetDiscountReportAsync(DateTime from, DateTime to)
    {
        var fromUtc = from.Date.ToUniversalTime();
        var toUtc = to.Date.AddDays(1).ToUniversalTime();

        return await _context.Sales
            .Include(s => s.User)
            .Where(s => s.SaleDate >= fromUtc && s.SaleDate < toUtc
                     && !s.IsVoided && s.DiscountAmount > 0)
            .OrderByDescending(s => s.SaleDate)
            .Select(s => new DiscountReportDto(
                s.InvoiceNumber,
                s.User.FullName,
                s.SaleDate,
                s.SubTotal,
                s.DiscountPercent,
                s.DiscountAmount,
                s.NetTotal))
            .ToListAsync();
    }

    public async Task<IEnumerable<LowStockItemDto>> GetLowStockReportAsync()
    {
        var products = await _uow.Products.GetLowStockAsync();
        return products.Select(p => new LowStockItemDto(
            p.ProductName, p.Category?.CategoryName ?? "", p.StockQuantity, p.ReorderLevel));
    }
}
