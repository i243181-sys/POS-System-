namespace SecureStore.POS.Configuration;

public class AppSettings
{
    public string ShopName { get; set; } = string.Empty;
    public string ShopAddress { get; set; } = string.Empty;
    public string ShopPhone { get; set; } = string.Empty;
    public string ShopEmail { get; set; } = string.Empty;
    public string Currency { get; set; } = string.Empty;
    public string CurrencySymbol { get; set; } = string.Empty;
    public decimal TaxPercentage { get; set; }
    public int SessionTimeoutMinutes { get; set; }
    public int MaxFailedLoginAttempts { get; set; }
    public string BackupFolderPath { get; set; } = "Backups";
    public string LogFolderPath { get; set; } = "Logs";
    public bool AutoBackupEnabled { get; set; }
    public int AutoBackupTimeHour { get; set; }
    public string InvoicePrefix { get; set; } = "POS";
    public int LowStockThreshold { get; set; }
    public decimal CashierMaxDiscountPercent { get; set; }
    public decimal ManagerMaxDiscountPercent { get; set; }
    public decimal AdminMaxDiscountPercent { get; set; }
    public string ReceiptFooterMessage { get; set; } = string.Empty;
    public string DatabaseVersion { get; set; } = string.Empty;
}
