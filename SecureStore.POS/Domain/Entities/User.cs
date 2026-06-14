using SecureStore.POS.Domain.Enums;

namespace SecureStore.POS.Domain.Entities;

public class User
{
    public int UserID { get; set; }
    public string Username { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public int RoleID { get; set; }
    public AccountStatus Status { get; set; } = AccountStatus.Active;
    public int FailedLoginAttempts { get; set; } = 0;
    public DateTime? LastLoginAt { get; set; }
    public DateTime? LockedUntil { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Role Role { get; set; } = null!;
    public ICollection<Sale> Sales { get; set; } = new List<Sale>();
    public ICollection<AuditLog> AuditLogs { get; set; } = new List<AuditLog>();
    public ICollection<InventoryTransaction> InventoryTransactions { get; set; } = new List<InventoryTransaction>();
    public ICollection<ProductBackup> ProductBackups { get; set; } = new List<ProductBackup>();
}
