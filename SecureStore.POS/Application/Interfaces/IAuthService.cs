using SecureStore.POS.Application.DTOs;

namespace SecureStore.POS.Application.Interfaces;

public interface IAuthService
{
    Task<LoginResultDto> LoginAsync(LoginDto dto);
    Task LogoutAsync();
    Task<bool> ChangePasswordAsync(ChangePasswordDto dto);
    Task<bool> UnlockAccountAsync(int userId, int adminUserId);
    Task<bool> ResetFailedAttemptsAsync(int userId);
}
