using Microsoft.EntityFrameworkCore;
using SecureStore.POS.Domain.Entities;
using SecureStore.POS.Infrastructure.Data;

namespace SecureStore.POS.Infrastructure.Repositories;

public interface IUserRepository : IRepository<User>
{
    Task<User?> GetByUsernameAsync(string username);
    Task<User?> GetWithRoleAsync(int userId);
    Task<IEnumerable<User>> GetAllWithRolesAsync();
}

public class UserRepository : Repository<User>, IUserRepository
{
    public UserRepository(AppDbContext context) : base(context) { }

    public async Task<User?> GetByUsernameAsync(string username)
    {
        var normalized = username.Trim().ToLower();
        return await _context.Users
            .Include(u => u.Role)
            .FirstOrDefaultAsync(u => u.Username.ToLower() == normalized);
    }

    public async Task<User?> GetWithRoleAsync(int userId) =>
        await _context.Users
            .Include(u => u.Role)
            .FirstOrDefaultAsync(u => u.UserID == userId);

    public async Task<IEnumerable<User>> GetAllWithRolesAsync() =>
        await _context.Users
            .Include(u => u.Role)
            .OrderBy(u => u.FullName)
            .ToListAsync();
}
