namespace SecureStore.POS.Domain.Entities;

public class Customer
{
    public int CustomerID { get; set; }
    public string? AccountNumber { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string? FatherName { get; set; }
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public string? Address { get; set; }
    public decimal LoyaltyPoints { get; set; } = 0;
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public ICollection<Sale> Sales { get; set; } = new List<Sale>();
}
