namespace SecureStore.POS.Domain.Entities;

public class BackupLog
{
    public int BackupID { get; set; }
    public string BackupPath { get; set; } = string.Empty;
    public long FileSizeBytes { get; set; }
    public DateTime BackupDate { get; set; } = DateTime.UtcNow;
    public int? CreatedByUserID { get; set; }
    public string Status { get; set; } = "Success"; // Success | Failed
    public string? ErrorMessage { get; set; }
    public bool IsAutomatic { get; set; } = false;

    // Navigation
    public User? CreatedByUser { get; set; }
}
