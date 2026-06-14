using Microsoft.EntityFrameworkCore;
using SecureStore.POS.Domain.Entities;
using SecureStore.POS.Domain.Enums;

namespace SecureStore.POS.Infrastructure.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    // DbSets
    public DbSet<Role> Roles => Set<Role>();
    public DbSet<User> Users => Set<User>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<Sale> Sales => Set<Sale>();
    public DbSet<SaleItem> SaleItems => Set<SaleItem>();
    public DbSet<ProductBackup> ProductBackups => Set<ProductBackup>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<InventoryTransaction> InventoryTransactions => Set<InventoryTransaction>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<Setting> Settings => Set<Setting>();
    public DbSet<BackupLog> BackupLogs => Set<BackupLog>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        var nowSql = Database.IsSqlite() ? "CURRENT_TIMESTAMP" : "GETUTCDATE()";

        // ── Roles ──────────────────────────────────────────────────────────
        modelBuilder.Entity<Role>(e =>
        {
            e.HasKey(r => r.RoleID);
            e.Property(r => r.RoleName).IsRequired().HasMaxLength(50);
            e.HasIndex(r => r.RoleName).IsUnique();
        });

        // ── Users ──────────────────────────────────────────────────────────
        modelBuilder.Entity<User>(e =>
        {
            e.HasKey(u => u.UserID);
            e.Property(u => u.Username).IsRequired().HasMaxLength(50);
            e.Property(u => u.Username).UseCollation(Database.IsSqlite() ? "NOCASE" : "Latin1_General_CI_AS");
            e.HasIndex(u => u.Username).IsUnique();
            e.Property(u => u.PasswordHash).IsRequired().HasMaxLength(256);
            e.Property(u => u.FullName).IsRequired().HasMaxLength(100);
            e.Property(u => u.Status).HasConversion<int>();
            e.Property(u => u.FailedLoginAttempts).HasDefaultValue(0);
            e.Property(u => u.CreatedAt).HasDefaultValueSql(nowSql);
            e.Property(u => u.UpdatedAt).HasDefaultValueSql(nowSql);

            e.HasOne(u => u.Role)
             .WithMany(r => r.Users)
             .HasForeignKey(u => u.RoleID)
             .OnDelete(DeleteBehavior.Restrict);

            e.HasIndex(u => u.RoleID);
        });

        // ── Categories ─────────────────────────────────────────────────────
        modelBuilder.Entity<Category>(e =>
        {
            e.HasKey(c => c.CategoryID);
            e.Property(c => c.CategoryName).IsRequired().HasMaxLength(100);
            e.HasIndex(c => c.CategoryName).IsUnique();
            e.Property(c => c.CreatedAt).HasDefaultValueSql(nowSql);
        });

        // ── Products ───────────────────────────────────────────────────────
        modelBuilder.Entity<Product>(e =>
        {
            e.HasKey(p => p.ProductID);
            e.Property(p => p.ProductName).IsRequired().HasMaxLength(200);
            e.Property(p => p.Barcode).HasMaxLength(100);
            e.HasIndex(p => p.Barcode).IsUnique().HasFilter(Database.IsSqlite() ? "Barcode IS NOT NULL" : "[Barcode] IS NOT NULL");
            e.HasIndex(p => p.ProductName);
            e.Property(p => p.Brand).HasMaxLength(100);
            e.Property(p => p.PurchasePrice).HasColumnType("decimal(18,2)");
            e.Property(p => p.SellingPrice).HasColumnType("decimal(18,2)");
            e.Property(p => p.StockQuantity).HasDefaultValue(0);
            e.Property(p => p.ReorderLevel).HasDefaultValue(10);
            e.Property(p => p.IsActive).HasDefaultValue(true);
            e.Property(p => p.CreatedAt).HasDefaultValueSql(nowSql);
            e.Property(p => p.UpdatedAt).HasDefaultValueSql(nowSql);
            e.ToTable(t =>
            {
                t.HasCheckConstraint("CK_Products_SellingPrice_Positive", "SellingPrice > 0");
                t.HasCheckConstraint("CK_Products_PurchasePrice_NonNegative", "PurchasePrice >= 0");
                t.HasCheckConstraint("CK_Products_StockQuantity_NonNegative", "StockQuantity >= 0");
                t.HasCheckConstraint("CK_Products_ReorderLevel_NonNegative", "ReorderLevel >= 0");
            });

            e.HasOne(p => p.Category)
             .WithMany(c => c.Products)
             .HasForeignKey(p => p.CategoryID)
             .OnDelete(DeleteBehavior.Restrict);

            e.HasIndex(p => p.CategoryID);
            e.HasIndex(p => p.IsActive);
        });

        // ── Customers ──────────────────────────────────────────────────────
        modelBuilder.Entity<Customer>(e =>
        {
            e.HasKey(c => c.CustomerID);
            e.Property(c => c.AccountNumber).HasMaxLength(30);
            e.HasIndex(c => c.AccountNumber).IsUnique();
            e.Property(c => c.FullName).IsRequired().HasMaxLength(100);
            e.Property(c => c.FatherName).HasMaxLength(100);
            e.Property(c => c.Phone).HasMaxLength(20);
            e.Property(c => c.Email).HasMaxLength(100);
            e.Property(c => c.Address).HasMaxLength(250);
            e.Property(c => c.LoyaltyPoints).HasColumnType("decimal(18,2)").HasDefaultValue(0);
            e.Property(c => c.CreatedAt).HasDefaultValueSql(nowSql);
        });

        // ── Sales ──────────────────────────────────────────────────────────
        modelBuilder.Entity<Sale>(e =>
        {
            e.HasKey(s => s.SaleID);
            e.Property(s => s.InvoiceNumber).IsRequired().HasMaxLength(30);
            e.HasIndex(s => s.InvoiceNumber).IsUnique();
            e.HasIndex(s => s.SaleDate);
            e.HasIndex(s => s.UserID);
            e.Property(s => s.SubTotal).HasColumnType("decimal(18,2)");
            e.Property(s => s.DiscountAmount).HasColumnType("decimal(18,2)");
            e.Property(s => s.DiscountPercent).HasColumnType("decimal(5,2)");
            e.Property(s => s.TaxAmount).HasColumnType("decimal(18,2)");
            e.Property(s => s.NetTotal).HasColumnType("decimal(18,2)");
            e.Property(s => s.PaidAmount).HasColumnType("decimal(18,2)");
            e.Property(s => s.ChangeAmount).HasColumnType("decimal(18,2)");
            e.Property(s => s.PaymentStatus).HasConversion<int>();
            e.Property(s => s.IsVoided).HasDefaultValue(false);
            e.Property(s => s.CreatedAt).HasDefaultValueSql(nowSql);
            e.Property(s => s.SaleDate).HasDefaultValueSql(nowSql);
            e.Property(s => s.Notes).HasMaxLength(500);
            e.ToTable(t =>
            {
                t.HasCheckConstraint("CK_Sales_SubTotal_NonNegative", "SubTotal >= 0");
                t.HasCheckConstraint("CK_Sales_DiscountAmount_NonNegative", "DiscountAmount >= 0");
                t.HasCheckConstraint("CK_Sales_DiscountPercent_Range", "DiscountPercent >= 0 AND DiscountPercent <= 100");
                t.HasCheckConstraint("CK_Sales_TaxAmount_NonNegative", "TaxAmount >= 0");
                t.HasCheckConstraint("CK_Sales_NetTotal_NonNegative", "NetTotal >= 0");
                t.HasCheckConstraint("CK_Sales_PaidAmount_NonNegative", "PaidAmount >= 0");
                t.HasCheckConstraint("CK_Sales_ChangeAmount_NonNegative", "ChangeAmount >= 0");
                t.HasCheckConstraint("CK_Sales_ChangeAmount_NotAbovePaid", "ChangeAmount <= PaidAmount");
            });

            e.HasOne(s => s.User)
             .WithMany(u => u.Sales)
             .HasForeignKey(s => s.UserID)
             .OnDelete(DeleteBehavior.Restrict);

            e.HasOne(s => s.Customer)
             .WithMany(c => c.Sales)
             .HasForeignKey(s => s.CustomerID)
             .OnDelete(DeleteBehavior.SetNull)
             .IsRequired(false);
        });

        // ── SaleItems ──────────────────────────────────────────────────────
        modelBuilder.Entity<SaleItem>(e =>
        {
            e.HasKey(si => si.SaleItemID);
            e.Property(si => si.ProductName).IsRequired().HasMaxLength(200);
            e.Property(si => si.UnitPrice).HasColumnType("decimal(18,2)");
            e.Property(si => si.UnitCost).HasColumnType("decimal(18,2)").HasDefaultValue(0);
            e.Property(si => si.LineDiscount).HasColumnType("decimal(18,2)").HasDefaultValue(0);
            e.Property(si => si.LineTotal).HasColumnType("decimal(18,2)");
            e.ToTable(t =>
            {
                t.HasCheckConstraint("CK_SaleItems_Quantity_Positive", "Quantity > 0");
                t.HasCheckConstraint("CK_SaleItems_UnitPrice_Positive", "UnitPrice > 0");
                t.HasCheckConstraint("CK_SaleItems_UnitCost_NonNegative", "UnitCost >= 0");
                t.HasCheckConstraint("CK_SaleItems_LineTotal_NonNegative", "LineTotal >= 0");
            });

            e.HasOne(si => si.Sale)
             .WithMany(s => s.SaleItems)
             .HasForeignKey(si => si.SaleID)
             .OnDelete(DeleteBehavior.Cascade);

            e.HasOne(si => si.Product)
             .WithMany(p => p.SaleItems)
             .HasForeignKey(si => si.ProductID)
             .OnDelete(DeleteBehavior.Restrict);

            e.HasIndex(si => si.SaleID);
        });

        // ── Payments ───────────────────────────────────────────────────────
        modelBuilder.Entity<ProductBackup>(e =>
        {
            e.HasKey(pb => pb.ProductBackupID);
            e.Property(pb => pb.Action).IsRequired().HasMaxLength(50);
            e.Property(pb => pb.DataPath).IsRequired().HasMaxLength(500);
            e.Property(pb => pb.ChecksumSha256).HasMaxLength(64);
            e.Property(pb => pb.CreatedAt).HasDefaultValueSql(nowSql);

            e.HasOne(pb => pb.Product)
             .WithMany(p => p.ProductBackups)
             .HasForeignKey(pb => pb.ProductID)
             .OnDelete(DeleteBehavior.SetNull)
             .IsRequired(false);

            e.HasOne(pb => pb.CreatedByUser)
             .WithMany(u => u.ProductBackups)
             .HasForeignKey(pb => pb.CreatedByUserID)
             .OnDelete(DeleteBehavior.SetNull)
             .IsRequired(false);

            e.HasIndex(pb => pb.ProductID);
        });

        // ── Payments ───────────────────────────────────────────────────────
        modelBuilder.Entity<Payment>(e =>
        {
            e.HasKey(p => p.PaymentID);
            e.Property(p => p.Amount).HasColumnType("decimal(18,2)");
            e.Property(p => p.PaymentMethod).HasConversion<int>();
            e.Property(p => p.ReferenceNo).HasMaxLength(100);
            e.Property(p => p.PaymentDate).HasDefaultValueSql(nowSql);
            e.ToTable(t => t.HasCheckConstraint("CK_Payments_Amount_Positive", "Amount > 0"));

            e.HasOne(p => p.Sale)
             .WithMany(s => s.Payments)
             .HasForeignKey(p => p.SaleID)
             .OnDelete(DeleteBehavior.Cascade);

            e.HasIndex(p => p.SaleID);
        });

        // ── InventoryTransactions ──────────────────────────────────────────
        modelBuilder.Entity<InventoryTransaction>(e =>
        {
            e.HasKey(it => it.InventoryTransactionID);
            e.Property(it => it.TransactionType).HasConversion<int>();
            e.Property(it => it.Reason).IsRequired().HasMaxLength(500);
            e.Property(it => it.CreatedAt).HasDefaultValueSql(nowSql);
            e.ToTable(t =>
            {
                t.HasCheckConstraint("CK_InventoryTransactions_OldStock_NonNegative", "OldStock >= 0");
                t.HasCheckConstraint("CK_InventoryTransactions_NewStock_NonNegative", "NewStock >= 0");
            });

            e.HasOne(it => it.Product)
             .WithMany(p => p.InventoryTransactions)
             .HasForeignKey(it => it.ProductID)
             .OnDelete(DeleteBehavior.Restrict);

            e.HasOne(it => it.User)
             .WithMany(u => u.InventoryTransactions)
             .HasForeignKey(it => it.UserID)
             .OnDelete(DeleteBehavior.Restrict);

            e.HasIndex(it => it.ProductID);
            e.HasIndex(it => it.CreatedAt);
        });

        // ── AuditLogs ──────────────────────────────────────────────────────
        modelBuilder.Entity<AuditLog>(e =>
        {
            e.HasKey(al => al.AuditLogID);
            e.Property(al => al.Action).IsRequired().HasMaxLength(100);
            e.Property(al => al.EntityName).IsRequired().HasMaxLength(100);
            e.Property(al => al.EntityID).HasMaxLength(50);
            e.Property(al => al.Description).IsRequired().HasMaxLength(1000);
            e.Property(al => al.DeviceName).HasMaxLength(100);
            e.Property(al => al.IpAddress).HasMaxLength(45);
            e.Property(al => al.CreatedAt).HasDefaultValueSql(nowSql);

            e.HasOne(al => al.User)
             .WithMany(u => u.AuditLogs)
             .HasForeignKey(al => al.UserID)
             .OnDelete(DeleteBehavior.SetNull)
             .IsRequired(false);

            e.HasIndex(al => al.CreatedAt);
            e.HasIndex(al => al.UserID);
            e.HasIndex(al => al.Action);
        });

        // ── Settings ───────────────────────────────────────────────────────
        modelBuilder.Entity<Setting>(e =>
        {
            e.HasKey(s => s.SettingID);
            e.Property(s => s.SettingKey).IsRequired().HasMaxLength(100);
            e.HasIndex(s => s.SettingKey).IsUnique();
            e.Property(s => s.SettingValue).IsRequired().HasMaxLength(1000);
            e.Property(s => s.Description).HasMaxLength(500);
            e.Property(s => s.UpdatedAt).HasDefaultValueSql(nowSql);
        });

        // ── BackupLogs ─────────────────────────────────────────────────────
        modelBuilder.Entity<BackupLog>(e =>
        {
            e.HasKey(bl => bl.BackupID);
            e.Property(bl => bl.BackupPath).IsRequired().HasMaxLength(500);
            e.Property(bl => bl.Status).IsRequired().HasMaxLength(20);
            e.Property(bl => bl.ErrorMessage).HasMaxLength(1000);
            e.Property(bl => bl.BackupDate).HasDefaultValueSql(nowSql);

            e.HasOne(bl => bl.CreatedByUser)
             .WithMany()
             .HasForeignKey(bl => bl.CreatedByUserID)
             .OnDelete(DeleteBehavior.SetNull)
             .IsRequired(false);

            e.HasIndex(bl => bl.BackupDate);
        });
    }
}
