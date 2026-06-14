using SecureStore.POS.Domain.Enums;

namespace SecureStore.POS.Security;

/// <summary>
/// Centralises role-based permission checks and discount limit enforcement.
/// </summary>
public static class PermissionGuard
{
    private static readonly Dictionary<string, double> _maxDiscountByRole = new()
    {
        { "Admin",   100.0 },
        { "Manager",  20.0 },
        { "Cashier",   5.0 }
    };

    /// <summary>Returns whether the current session user can perform an action.</summary>
    public static bool CanAccess(string requiredRole)
    {
        var session = SessionManager.Instance;
        if (!session.IsLoggedIn) return false;
        var userRole = session.CurrentUser!.Role?.RoleName ?? "";

        return requiredRole switch
        {
            "Admin"   => userRole == "Admin",
            "Manager" => userRole is "Admin" or "Manager",
            "Cashier" => true,
            _         => false
        };
    }

    /// <summary>Gets the maximum discount percentage allowed for the current user's role.</summary>
    public static double GetMaxDiscountPercent()
    {
        var role = SessionManager.Instance.CurrentUser?.Role?.RoleName ?? "Cashier";
        return _maxDiscountByRole.TryGetValue(role, out var max) ? max : 5.0;
    }

    /// <summary>Validates that a requested discount is within the user's permitted limit.</summary>
    public static (bool isAllowed, string message) ValidateDiscount(decimal discountPercent)
    {
        var max = (decimal)GetMaxDiscountPercent();
        if (discountPercent < 0)
            return (false, "Discount cannot be negative.");
        if (discountPercent > max)
        {
            var role = SessionManager.Instance.CurrentUser?.Role?.RoleName ?? "Cashier";
            return (false, $"Your role ({role}) cannot apply more than {max}% discount. Please ask a Manager/Admin.");
        }
        return (true, string.Empty);
    }

    public static bool RequireLogin()
    {
        if (!SessionManager.Instance.IsLoggedIn || SessionManager.Instance.IsSessionExpired())
            return false;
        SessionManager.Instance.RefreshActivity();
        return true;
    }
}
