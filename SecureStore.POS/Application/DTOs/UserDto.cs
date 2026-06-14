using SecureStore.POS.Domain.Enums;

namespace SecureStore.POS.Application.DTOs;

public record LoginDto(string Username, string Password);

public record LoginResultDto(
    bool Success,
    string Message,
    int? UserId,
    string? FullName,
    string? RoleName,
    bool IsLocked = false);

public record UserDto(
    int UserID,
    string Username,
    string FullName,
    string RoleName,
    int RoleID,
    AccountStatus Status,
    int FailedLoginAttempts,
    DateTime CreatedAt);

public record CreateUserDto(
    string Username,
    string PlainPassword,
    string FullName,
    int RoleID);

public record UpdateUserDto(
    int UserID,
    string FullName,
    int RoleID,
    AccountStatus Status);

public record ChangePasswordDto(
    int UserID,
    string OldPassword,
    string NewPassword);
