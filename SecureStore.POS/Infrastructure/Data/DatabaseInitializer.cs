using Microsoft.Extensions.Configuration;
using SecureStore.POS.Domain.Entities;
using SecureStore.POS.Domain.Enums;
using SecureStore.POS.Infrastructure.UnitOfWork;
using SecureStore.POS.Security;

namespace SecureStore.POS.Infrastructure.Data;

public class DatabaseInitializer
{
    private readonly IUnitOfWork _unitOfWork;
    private readonly AppDbContext _context;
    private readonly IConfiguration _configuration;

    public DatabaseInitializer(IUnitOfWork unitOfWork, AppDbContext context, IConfiguration configuration)
    {
        _unitOfWork = unitOfWork;
        _context = context;
        _configuration = configuration;
    }

    public async Task InitializeAsync()
    {
        await _context.Database.EnsureCreatedAsync();

        if (!await _unitOfWork.Roles.ExistsAsync(r => r.RoleName == UserRole.Admin.ToString()))
        {
            await _unitOfWork.Roles.AddAsync(new Role { RoleName = UserRole.Admin.ToString() });
            await _unitOfWork.Roles.AddAsync(new Role { RoleName = UserRole.Manager.ToString() });
            await _unitOfWork.Roles.AddAsync(new Role { RoleName = UserRole.Cashier.ToString() });
            await _unitOfWork.SaveChangesAsync();
        }

        if (!await _unitOfWork.Users.ExistsAsync(u => u.Username == "admin"))
        {
            var initialAdminPassword = Environment.GetEnvironmentVariable("POS_INITIAL_ADMIN_PASSWORD");
            if (string.IsNullOrWhiteSpace(initialAdminPassword) || initialAdminPassword.Length < 12)
                throw new InvalidOperationException("POS_INITIAL_ADMIN_PASSWORD must be set to at least 12 characters before creating a fresh POS database.");

            var initialManagerPassword = Environment.GetEnvironmentVariable("POS_INITIAL_MANAGER_PASSWORD");
            var initialCashierPassword = Environment.GetEnvironmentVariable("POS_INITIAL_CASHIER_PASSWORD");
            var roles = (await _unitOfWork.Roles.GetAllAsync()).ToDictionary(r => r.RoleName, r => r.RoleID);
            await _unitOfWork.Users.AddAsync(new User
            {
                Username = "admin",
                PasswordHash = PasswordHasher.Hash(initialAdminPassword),
                FullName = "System Administrator",
                RoleID = roles[UserRole.Admin.ToString()],
                Status = AccountStatus.Active
            });

            if (!string.IsNullOrWhiteSpace(initialManagerPassword) && initialManagerPassword.Length >= 12)
            {
                await _unitOfWork.Users.AddAsync(new User
                {
                    Username = "manager",
                    PasswordHash = PasswordHasher.Hash(initialManagerPassword),
                    FullName = "Store Manager",
                    RoleID = roles[UserRole.Manager.ToString()],
                    Status = AccountStatus.Active
                });
            }

            if (!string.IsNullOrWhiteSpace(initialCashierPassword) && initialCashierPassword.Length >= 12)
            {
                await _unitOfWork.Users.AddAsync(new User
                {
                    Username = "cashier",
                    PasswordHash = PasswordHasher.Hash(initialCashierPassword),
                    FullName = "Front Desk Cashier",
                    RoleID = roles[UserRole.Cashier.ToString()],
                    Status = AccountStatus.Active
                });
            }
            await _unitOfWork.SaveChangesAsync();
        }

        if (!await _unitOfWork.Categories.ExistsAsync(c => c.CategoryName == "Wheat"))
        {
            var categories = new[]
            {
                new Category { CategoryName = "Wheat", Description = "Pesticides, herbicides, fungicides, seed treatment, and crop inputs for wheat" },
                new Category { CategoryName = "Sugar Cane", Description = "Crop protection and nutrition products for sugar cane" },
                new Category { CategoryName = "Cotton", Description = "Insecticides, herbicides, fungicides, and growth support products for cotton" },
                new Category { CategoryName = "Rice / Paddy", Description = "Crop protection and field inputs for rice and paddy" },
                new Category { CategoryName = "Maize / Corn", Description = "Pesticides and crop inputs for maize and corn" },
                new Category { CategoryName = "Vegetables", Description = "Crop protection products for vegetable crops" },
                new Category { CategoryName = "Fruits & Orchards", Description = "Pesticides, fungicides, and nutrition products for fruit crops and orchards" },
                new Category { CategoryName = "Herbicides", Description = "Weed control products for field and row crops" },
                new Category { CategoryName = "Insecticides", Description = "Products for control of insects, borers, sucking pests, and mites" },
                new Category { CategoryName = "Fungicides", Description = "Products for fungal disease control and seed or foliar protection" },
                new Category { CategoryName = "Fertilizers & Micronutrients", Description = "Foliar feeds, micronutrients, and soil nutrition products" },
                new Category { CategoryName = "Seeds & Field Supplies", Description = "Seeds, sprayers, safety items, and other field supplies" }
            };

            await _unitOfWork.Categories.AddRangeAsync(categories);
            await _unitOfWork.SaveChangesAsync();
        }
    }
}
