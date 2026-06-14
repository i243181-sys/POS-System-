using Microsoft.Extensions.Configuration;
using SecureStore.POS.Domain.Entities;
using SecureStore.POS.Domain.Enums;
using SecureStore.POS.Infrastructure.UnitOfWork;
using SecureStore.POS.Security;

namespace SecureStore.POS.Services;

public class AuthenticationService : IAuthenticationService
{
    private readonly IUnitOfWork _unitOfWork;
    private readonly IConfiguration _configuration;
    private readonly SessionManager _sessionManager;
    private readonly IAuditService _auditService;

    public AuthenticationService(IUnitOfWork unitOfWork, IConfiguration configuration, SessionManager sessionManager, IAuditService auditService)
    {
        _unitOfWork = unitOfWork;
        _configuration = configuration;
        _sessionManager = sessionManager;
        _auditService = auditService;
        _sessionManager.SessionTimeoutMinutes = Math.Clamp(
            _configuration.GetValue<int>("AppSettings:SessionTimeoutMinutes", 30),
            5,
            480);
    }

    public async Task<AuthenticationResult> LoginAsync(string username, string password)
    {
        username = (username ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password))
            return new AuthenticationResult(false, "Invalid username or password.", null);

        var user = await _unitOfWork.Users.GetByUsernameAsync(username);
        if (user is null)
        {
            await _auditService.LogAsync(null, "LoginFailed", "User", null, "Unknown username attempted login.");
            return new AuthenticationResult(false, "Invalid username or password.", null);
        }

        if (user.Status == AccountStatus.Inactive)
        {
            await _auditService.LogAsync(user.UserID, "LoginFailed", "User", user.UserID.ToString(), "Account is inactive.");
            return new AuthenticationResult(false, "Account is inactive. Contact administrator.", null);
        }

        if (user.Status == AccountStatus.Locked && user.LockedUntil is not null && user.LockedUntil.Value > DateTime.UtcNow)
        {
            await _auditService.LogAsync(user.UserID, "LoginFailed", "User", user.UserID.ToString(), "Login blocked because account is locked.");
            return new AuthenticationResult(false, $"Account locked until {user.LockedUntil.Value:u}.", null);
        }

        if (user.Status == AccountStatus.Locked)
        {
            user.Status = AccountStatus.Active;
            user.FailedLoginAttempts = 0;
            user.LockedUntil = null;
        }

        if (!PasswordHasher.Verify(password, user.PasswordHash))
        {
            user.FailedLoginAttempts++;
            var maxAttempts = Math.Clamp(_configuration.GetValue<int>("AppSettings:MaxFailedLoginAttempts", 5), 3, 20);
            if (user.FailedLoginAttempts >= maxAttempts)
            {
                user.Status = AccountStatus.Locked;
                user.LockedUntil = DateTime.UtcNow.AddMinutes(
                    Math.Clamp(_configuration.GetValue<int>("AppSettings:AccountLockoutMinutes", 30), 5, 1440));
            }

            _unitOfWork.Users.Update(user);
            await _unitOfWork.SaveChangesAsync();
            await _auditService.LogAsync(user.UserID, "LoginFailed", "User", user.UserID.ToString(), "Invalid password.");
            return new AuthenticationResult(false, "Invalid username or password.", null);
        }

        user.FailedLoginAttempts = 0;
        user.Status = AccountStatus.Active;
        user.LastLoginAt = DateTime.UtcNow;
        if (PasswordHasher.NeedsRehash(user.PasswordHash))
            user.PasswordHash = PasswordHasher.Hash(password);
        _unitOfWork.Users.Update(user);
        await _unitOfWork.SaveChangesAsync();

        _sessionManager.StartSession(user);
        await _auditService.LogAsync(user.UserID, "LoginSuccess", "User", user.UserID.ToString(), "User logged in successfully.");

        return new AuthenticationResult(true, "Login successful.", user);
    }

    public async Task LogoutAsync()
    {
        var user = _sessionManager.CurrentUser;
        _sessionManager.EndSession();
        if (user is not null)
            await _auditService.LogAsync(user.UserID, "Logout", "User", user.UserID.ToString(), "User logged out.");
    }

    public async Task<IEnumerable<User>> GetUsersAsync() => await _unitOfWork.Users.GetAllWithRolesAsync();

    public async Task<bool> CreateUserAsync(User user, string password)
    {
        if (string.IsNullOrWhiteSpace(user.Username))
            throw new ArgumentException("Username is required.", nameof(user.Username));
        if (string.IsNullOrWhiteSpace(user.FullName))
            throw new ArgumentException("Full name is required.", nameof(user.FullName));

        user.Username = user.Username.Trim();
        user.FullName = user.FullName.Trim();

        if (await _unitOfWork.Users.ExistsAsync(u => u.Username.ToLower() == user.Username.ToLower()))
            return false;

        user.PasswordHash = PasswordHasher.Hash(password);
        user.Status = AccountStatus.Active;
        user.FailedLoginAttempts = 0;
        await _unitOfWork.Users.AddAsync(user);
        await _unitOfWork.SaveChangesAsync();
        await _auditService.LogAsync(user.UserID, "UserCreated", "User", user.UserID.ToString(), $"Created user {user.Username}.");
        return true;
    }

    public async Task<bool> UpdateUserStatusAsync(int userId, bool isActive)
    {
        var user = await _unitOfWork.Users.GetByIdAsync(userId);
        if (user is null) return false;

        user.Status = isActive ? AccountStatus.Active : AccountStatus.Inactive;
        _unitOfWork.Users.Update(user);
        await _unitOfWork.SaveChangesAsync();
        await _auditService.LogAsync(null, "UserStatusChanged", "User", user.UserID.ToString(), $"Set user {user.Username} status to {user.Status}.");
        return true;
    }
}
