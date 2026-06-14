namespace SecureStore.POS.Domain.Entities;

public class ProductBackup
{
    public int ProductBackupID { get; set; }
    public int? ProductID { get; set; }
    public string Action { get; set; } = string.Empty;
    public string DataPath { get; set; } = string.Empty;
    public string? ChecksumSha256 { get; set; }
    public int? CreatedByUserID { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Product? Product { get; set; }
    public User? CreatedByUser { get; set; }
}
