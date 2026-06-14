using SecureStore.POS.Application.DTOs;
using SecureStore.POS.Application.Interfaces;
using SecureStore.POS.Domain.Entities;
using SecureStore.POS.Domain.Enums;
using SecureStore.POS.Infrastructure.UnitOfWork;
using SecureStore.POS.Security;

namespace SecureStore.POS.Application.Services;

public class UserManagementService : IUserManagementService
{
    private readonly IUnitOfWork _uow;
    private readonly IAuditService _audit;

    public UserManagementService(IUnitOfWork uow, IAuditService audit)
    {
        _uow = uow;
        _audit = audit;
    }

    public async Task<IEnumerable<UserDto>> GetAllUsersAsync()
    {
        var users = await _uow.Users.GetAllWithRolesAsync();
        return users.Select(MapToDto);
    }

    public async Task<UserDto?> GetUserByIdAsync(int userId)
    {
        var user = await _uow.Users.GetWithRoleAsync(userId);
        return user is null ? null : MapToDto(user);
    }

    public async Task<(bool success, string message)> CreateUserAsync(
        CreateUserDto dto, int createdByUserId)
    {
        if (string.IsNullOrWhiteSpace(dto.Username))
            return (false, "Username is required.");
        if (string.IsNullOrWhiteSpace(dto.PlainPassword) || dto.PlainPassword.Length < PasswordHasher.MinimumPasswordLength)
            return (false, $"Password must be at least {PasswordHasher.MinimumPasswordLength} characters.");
        if (string.IsNullOrWhiteSpace(dto.FullName))
            return (false, "Full name is required.");
        if (!dto.Username.All(ch => char.IsLetterOrDigit(ch) || ch is '.' or '_' or '-'))
            return (false, "Username can only contain letters, numbers, dot, underscore, and hyphen.");
        if (!await _uow.Roles.ExistsAsync(r => r.RoleID == dto.RoleID))
            return (false, "Selected role does not exist.");

        var username = dto.Username.Trim();
        var exists = await _uow.Users.ExistsAsync(u => u.Username.ToLower() == username.ToLower());
        if (exists) return (false, $"Username '{dto.Username}' is already taken.");

        var user = new User
        {
            Username = username,
            PasswordHash = PasswordHasher.Hash(dto.PlainPassword),
            FullName = dto.FullName.Trim(),
            RoleID = dto.RoleID,
            Status = AccountStatus.Active,
            FailedLoginAttempts = 0,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        await _uow.Users.AddAsync(user);
        await _uow.SaveChangesAsync();

        await _audit.LogAsync("USER_CREATED", "User", user.UserID.ToString(),
            $"User '{user.Username}' created with role ID {dto.RoleID}.", createdByUserId);

        return (true, $"User '{user.Username}' created successfully.");
    }

    public async Task<(bool success, string message)> UpdateUserAsync(
        UpdateUserDto dto, int updatedByUserId)
    {
        var user = await _uow.Users.GetByIdAsync(dto.UserID);
        if (user is null) return (false, "User not found.");
        if (string.IsNullOrWhiteSpace(dto.FullName))
            return (false, "Full name is required.");
        if (!await _uow.Roles.ExistsAsync(r => r.RoleID == dto.RoleID))
            return (false, "Selected role does not exist.");

        user.FullName = dto.FullName.Trim();
        user.RoleID = dto.RoleID;
        user.Status = dto.Status;
        user.UpdatedAt = DateTime.UtcNow;

        _uow.Users.Update(user);
        await _uow.SaveChangesAsync();

        await _audit.LogAsync("USER_UPDATED", "User", user.UserID.ToString(),
            $"User '{user.Username}' updated.", updatedByUserId);

        return (true, "User updated successfully.");
    }

    public async Task<(bool success, string message)> UnlockUserAsync(int userId, int adminUserId)
    {
        var user = await _uow.Users.GetByIdAsync(userId);
        if (user is null) return (false, "User not found.");

        user.Status = AccountStatus.Active;
        user.FailedLoginAttempts = 0;
        user.LockedUntil = null;
        user.UpdatedAt = DateTime.UtcNow;

        _uow.Users.Update(user);
        await _uow.SaveChangesAsync();

        await _audit.LogAsync("ACCOUNT_UNLOCKED", "User", userId.ToString(),
            $"Account for '{user.Username}' unlocked by admin.", adminUserId);

        return (true, $"Account for '{user.Username}' unlocked.");
    }

    public async Task<IEnumerable<Role>> GetRolesAsync() =>
        await _uow.Roles.GetAllAsync();

    private static UserDto MapToDto(User u) => new(
        u.UserID, u.Username, u.FullName,
        u.Role?.RoleName ?? "", u.RoleID,
        u.Status, u.FailedLoginAttempts, u.CreatedAt);
}
