using SecureStore.POS.Domain.Enums;

namespace SecureStore.POS.Domain.Entities;

public class Role
{
    public int RoleID { get; set; }
    public string RoleName { get; set; } = string.Empty;

    // Navigation
    public ICollection<User> Users { get; set; } = new List<User>();
}
