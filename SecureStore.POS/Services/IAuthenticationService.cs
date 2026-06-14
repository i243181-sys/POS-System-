using SecureStore.POS.Domain.Entities;

namespace SecureStore.POS.Services;

public record AuthenticationResult(bool Success, string Message, User? User);

public interface IAuthenticationService
{
    Task<AuthenticationResult> LoginAsync(string username, string password);
    Task LogoutAsync();
    Task<IEnumerable<User>> GetUsersAsync();
    Task<bool> CreateUserAsync(User user, string password);
    Task<bool> UpdateUserStatusAsync(int userId, bool isActive);
}
