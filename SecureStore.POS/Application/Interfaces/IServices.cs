using SecureStore.POS.Application.DTOs;

namespace SecureStore.POS.Application.Interfaces;

public interface IStockService
{
    Task<(bool success, string message)> AdjustStockAsync(StockAdjustmentDto dto);
    Task<IEnumerable<ProductDto>> GetLowStockProductsAsync();
    Task<IEnumerable<Domain.Entities.InventoryTransaction>> GetInventoryHistoryAsync(int productId);
}

public interface IReportService
{
    Task<DashboardDto> GetDashboardDataAsync(int userId);
    Task<IEnumerable<DailySalesReportDto>> GetDailySalesReportAsync(DateTime from, DateTime to);
    Task<IEnumerable<ProductSalesReportDto>> GetProductSalesReportAsync(DateTime from, DateTime to);
    Task<IEnumerable<CashierSalesReportDto>> GetCashierSalesReportAsync(DateTime from, DateTime to);
    Task<IEnumerable<DiscountReportDto>> GetDiscountReportAsync(DateTime from, DateTime to);
    Task<IEnumerable<LowStockItemDto>> GetLowStockReportAsync();
}

public interface IAuditService
{
    Task LogAsync(string action, string entityName, string? entityId, string description, int? userId = null);
    Task<IEnumerable<Domain.Entities.AuditLog>> GetLogsAsync(DateTime from, DateTime to);
}

public interface IUserManagementService
{
    Task<IEnumerable<UserDto>> GetAllUsersAsync();
    Task<UserDto?> GetUserByIdAsync(int userId);
    Task<(bool success, string message)> CreateUserAsync(CreateUserDto dto, int createdByUserId);
    Task<(bool success, string message)> UpdateUserAsync(UpdateUserDto dto, int updatedByUserId);
    Task<(bool success, string message)> UnlockUserAsync(int userId, int adminUserId);
    Task<IEnumerable<Domain.Entities.Role>> GetRolesAsync();
}

public interface IBackupService
{
    Task<(bool success, string message, string? backupPath)> CreateBackupAsync(int userId, bool isAutomatic = false);
    Task<(bool success, string message)> RestoreBackupAsync(string backupFilePath, int userId);
    Task<IEnumerable<Domain.Entities.BackupLog>> GetBackupHistoryAsync();
}

public interface ISettingsService
{
    Task<string?> GetSettingAsync(string key);
    Task SetSettingAsync(string key, string value);
    Task<Dictionary<string, string>> GetAllSettingsAsync();
}
