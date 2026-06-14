using Microsoft.Extensions.Configuration;
using SecureStore.POS.Application.DTOs;
using SecureStore.POS.Application.Interfaces;
using SecureStore.POS.Domain.Enums;
using SecureStore.POS.Infrastructure.UnitOfWork;
using SecureStore.POS.Security;

namespace SecureStore.POS.Application.Services;

public class AuthService : IAuthService
{
    private readonly IUnitOfWork _uow;
    private readonly IAuditService _audit;
    private readonly IConfiguration _config;

    public AuthService(IUnitOfWork uow, IAuditService audit, IConfiguration config)
    {
        _uow = uow;
        _audit = audit;
        _config = config;

        // Apply session timeout from config
        var timeout = Math.Clamp(_config.GetValue<int>("AppSettings:SessionTimeoutMinutes", 30), 5, 480);
        SessionManager.Instance.SessionTimeoutMinutes = timeout;
    }

    public async Task<LoginResultDto> LoginAsync(LoginDto dto)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(dto.Username) || string.IsNullOrWhiteSpace(dto.Password))
                return new LoginResultDto(false, "Username and password are required.", null, null, null);

            var username = dto.Username.Trim();
            var user = await _uow.Users.GetByUsernameAsync(username);
            if (user is null)
            {
                await _audit.LogAsync("LOGIN_FAILED", "User", null,
                    "Login attempt with unknown username.");
                return new LoginResultDto(false, "Invalid username or password.", null, null, null);
            }

            // Check if account is inactive
            if (user.Status == AccountStatus.Inactive)
            {
                await _audit.LogAsync("LOGIN_FAILED", "User", user.UserID.ToString(),
                    "Login blocked because account is inactive.", user.UserID);
                return new LoginResultDto(false, "This account is inactive. Contact your administrator.", null, null, null);
            }

            // Check if account is locked
            if (user.Status == AccountStatus.Locked)
            {
                if (user.LockedUntil.HasValue && user.LockedUntil.Value > DateTime.UtcNow)
                {
                    await _audit.LogAsync("LOGIN_FAILED", "User", user.UserID.ToString(),
                        "Login blocked because account is locked.", user.UserID);
                    return new LoginResultDto(false,
                        $"Account is locked until {user.LockedUntil.Value.ToLocalTime():HH:mm dd/MM/yyyy}.",
                        null, null, null, IsLocked: true);
                }

                // Lock period expired — auto-unlock
                user.Status = AccountStatus.Active;
                user.FailedLoginAttempts = 0;
                user.LockedUntil = null;
            }

            // Verify password
            if (!PasswordHasher.Verify(dto.Password, user.PasswordHash))
            {
                user.FailedLoginAttempts++;
                var maxAttempts = Math.Clamp(_config.GetValue<int>("AppSettings:MaxFailedLoginAttempts", 5), 3, 20);

                if (user.FailedLoginAttempts >= maxAttempts)
                {
                    var lockoutMinutes = Math.Clamp(_config.GetValue<int>("AppSettings:AccountLockoutMinutes", 30), 5, 1440);
                    user.Status = AccountStatus.Locked;
                    user.LockedUntil = DateTime.UtcNow.AddMinutes(lockoutMinutes);
                    _uow.Users.Update(user);
                    await _uow.SaveChangesAsync();
                    await _audit.LogAsync("ACCOUNT_LOCKED", "User", user.UserID.ToString(),
                        $"Account locked after {user.FailedLoginAttempts} failed attempts.", user.UserID);
                    return new LoginResultDto(false,
                        $"Account locked after too many failed attempts. Try again in {lockoutMinutes} minutes.",
                        null, null, null, IsLocked: true);
                }

                _uow.Users.Update(user);
                await _uow.SaveChangesAsync();
                await _audit.LogAsync("LOGIN_FAILED", "User", user.UserID.ToString(),
                    $"Failed login attempt {user.FailedLoginAttempts}/{maxAttempts}.", user.UserID);
                return new LoginResultDto(false, "Invalid username or password.", null, null, null);
            }

            // Successful login — reset failed attempts
            user.FailedLoginAttempts = 0;
            user.LastLoginAt = DateTime.UtcNow;
            user.Status = AccountStatus.Active;
            if (PasswordHasher.NeedsRehash(user.PasswordHash))
                user.PasswordHash = PasswordHasher.Hash(dto.Password);
            _uow.Users.Update(user);
            await _uow.SaveChangesAsync();

            SessionManager.Instance.StartSession(user);

            await _audit.LogAsync("LOGIN_SUCCESS", "User", user.UserID.ToString(),
                $"User '{user.Username}' logged in successfully.", user.UserID);

            return new LoginResultDto(true, "Login successful.",
                user.UserID, user.FullName, user.Role?.RoleName);
        }
        catch (Exception ex)
        {
            AppLogger.LogError(ex, "AuthService.LoginAsync");
            return new LoginResultDto(false, "An unexpected error occurred during login.", null, null, null);
        }
    }

    public async Task LogoutAsync()
    {
        var userId = SessionManager.Instance.CurrentUser?.UserID;
        var username = SessionManager.Instance.CurrentUser?.Username;
        SessionManager.Instance.EndSession();
        if (userId.HasValue)
            await _audit.LogAsync("LOGOUT", "User", userId.ToString(),
                $"User '{username}' logged out.", userId);
    }

    public async Task<bool> ChangePasswordAsync(ChangePasswordDto dto)
    {
        try
        {
            var user = await _uow.Users.GetByIdAsync(dto.UserID);
            if (user is null) return false;
            if (string.IsNullOrWhiteSpace(dto.NewPassword) || dto.NewPassword.Length < PasswordHasher.MinimumPasswordLength)
                return false;

            if (!PasswordHasher.Verify(dto.OldPassword, user.PasswordHash))
                return false;

            user.PasswordHash = PasswordHasher.Hash(dto.NewPassword);
            user.UpdatedAt = DateTime.UtcNow;
            _uow.Users.Update(user);
            await _uow.SaveChangesAsync();

            await _audit.LogAsync("PASSWORD_CHANGED", "User", user.UserID.ToString(),
                $"Password changed for user '{user.Username}'.", user.UserID);
            return true;
        }
        catch (Exception ex)
        {
            AppLogger.LogError(ex, "AuthService.ChangePasswordAsync");
            return false;
        }
    }

    public async Task<bool> UnlockAccountAsync(int userId, int adminUserId)
    {
        var user = await _uow.Users.GetByIdAsync(userId);
        if (user is null) return false;

        user.Status = AccountStatus.Active;
        user.FailedLoginAttempts = 0;
        user.LockedUntil = null;
        user.UpdatedAt = DateTime.UtcNow;
        _uow.Users.Update(user);
        await _uow.SaveChangesAsync();

        await _audit.LogAsync("ACCOUNT_UNLOCKED", "User", userId.ToString(),
            $"Account unlocked by admin (UserID={adminUserId}).", adminUserId);
        return true;
    }

    public async Task<bool> ResetFailedAttemptsAsync(int userId)
    {
        var user = await _uow.Users.GetByIdAsync(userId);
        if (user is null) return false;
        user.FailedLoginAttempts = 0;
        user.UpdatedAt = DateTime.UtcNow;
        _uow.Users.Update(user);
        await _uow.SaveChangesAsync();
        await _audit.LogAsync("FAILED_ATTEMPTS_RESET", "User", userId.ToString(),
            "Failed login attempts were reset.", userId);
        return true;
    }
}
