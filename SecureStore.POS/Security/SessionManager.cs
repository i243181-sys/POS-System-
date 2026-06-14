using SecureStore.POS.Domain.Entities;
using SecureStore.POS.Domain.Enums;

namespace SecureStore.POS.Security;

/// <summary>
/// In-memory session manager. Tracks the currently logged-in user,
/// their role, and enforces session timeout after inactivity.
/// </summary>
public class SessionManager
{
    private static SessionManager? _instance;
    private static readonly object _lock = new();

    public static SessionManager Instance
    {
        get
        {
            lock (_lock)
            {
                _instance ??= new SessionManager();
                return _instance;
            }
        }
    }

    private SessionManager() { }

    public User? CurrentUser { get; private set; }
    public Guid? SessionId { get; private set; }
    public DateTime? SessionStartedAt { get; private set; }
    public DateTime? LastActivityAt { get; private set; }
    public bool IsLoggedIn => CurrentUser is not null;

    // Timeout in minutes — loaded from config
    public int SessionTimeoutMinutes { get; set; } = 30;

    public void StartSession(User user)
    {
        CurrentUser = user;
        SessionId = Guid.NewGuid();
        SessionStartedAt = DateTime.UtcNow;
        LastActivityAt = DateTime.UtcNow;
    }

    public void EndSession()
    {
        CurrentUser = null;
        SessionId = null;
        SessionStartedAt = null;
        LastActivityAt = null;
    }

    /// <summary>Call on any user action to reset the inactivity timer.</summary>
    public void RefreshActivity() => LastActivityAt = DateTime.UtcNow;

    /// <summary>Returns true if the session has timed out due to inactivity.</summary>
    public bool IsSessionExpired()
    {
        if (!IsLoggedIn || LastActivityAt is null) return true;
        var expired = (DateTime.UtcNow - LastActivityAt.Value).TotalMinutes >= SessionTimeoutMinutes;
        if (expired) EndSession();
        return expired;
    }

    public bool HasRole(UserRole role) =>
        IsLoggedIn && CurrentUser!.Role?.RoleName == role.ToString();

    public bool IsAdmin() => HasRole(UserRole.Admin);
    public bool IsManager() => HasRole(UserRole.Admin) || HasRole(UserRole.Manager);
    public bool IsCashier() => IsLoggedIn;
}
