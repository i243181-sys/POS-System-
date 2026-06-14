namespace SecureStore.POS.Domain.Entities;

public class AuditLog
{
    public int AuditLogID { get; set; }
    public int? UserID { get; set; }
    public string Action { get; set; } = string.Empty;
    public string EntityName { get; set; } = string.Empty;
    public string? EntityID { get; set; }
    public string Description { get; set; } = string.Empty;
    public string DeviceName { get; set; } = Environment.MachineName;
    public string? IpAddress { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public User? User { get; set; }
}
