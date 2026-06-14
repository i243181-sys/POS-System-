using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using SecureStore.POS.Domain.Entities;
using SecureStore.POS.Domain.Enums;
using SecureStore.POS.Infrastructure.UnitOfWork;
using SecureStore.POS.Services.Requests;

namespace SecureStore.POS.Services;

public class SaleService : ISaleService
{
    private readonly IUnitOfWork _unitOfWork;
    private readonly IConfiguration _configuration;
    private readonly IAuditService _auditService;

    public SaleService(IUnitOfWork unitOfWork, IConfiguration configuration, IAuditService auditService)
    {
        _unitOfWork = unitOfWork;
        _configuration = configuration;
        _auditService = auditService;
    }

    public async Task<Sale> CompleteSaleAsync(SaleRequest request, int userId)
    {
        if (request.Items == null || !request.Items.Any())
            throw new InvalidOperationException("Cart is empty.");

        var productIds = request.Items.Select(i => i.ProductID).Distinct().ToList();
        var products = (await _unitOfWork.Products.GetByIdsAsync(productIds)).ToList();
        if (products.Count != productIds.Count)
            throw new InvalidOperationException("One or more products are no longer available.");
        var productsById = products.ToDictionary(p => p.ProductID);
        foreach (var item in request.Items)
        {
            if (item.Quantity <= 0)
                throw new InvalidOperationException("Quantity must be greater than zero.");
            var product = productsById[item.ProductID];
            item.UnitPrice = product.SellingPrice;
            item.ProductName = product.ProductName;
            item.StockQuantity = product.StockQuantity;
        }

        var subtotal = request.Items.Sum(item => item.UnitPrice * item.Quantity);
        var discountAmount = request.DiscountPercent > 0
            ? Math.Round(subtotal * request.DiscountPercent / 100, 2)
            : request.DiscountAmount;
        if (discountAmount < 0 || discountAmount > subtotal)
            throw new InvalidOperationException("Discount amount must be between zero and the subtotal.");
        if (request.DiscountPercent < 0 || request.DiscountPercent > 100)
            throw new InvalidOperationException("Discount percent must be between 0 and 100.");
        if (request.TaxPercent < 0 || request.TaxPercent > 100)
            throw new InvalidOperationException("Tax percent must be between 0 and 100.");
        var effectiveDiscountPercent = subtotal > 0 ? Math.Round(discountAmount / subtotal * 100, 2) : 0m;

        var maxDiscount = await GetMaxAllowedDiscountAsync(userId);
        if (effectiveDiscountPercent > maxDiscount)
            throw new InvalidOperationException($"Applied discount exceeds allowed {maxDiscount}% for your role.");

        var taxAmount = Math.Round((subtotal - discountAmount) * request.TaxPercent / 100, 2);
        var netTotal = Math.Round(subtotal - discountAmount + taxAmount, 2);
        if (request.PaidAmount < 0) throw new InvalidOperationException("Paid amount cannot be negative.");
        if (request.PaymentMethod != PaymentMethod.Cash) throw new InvalidOperationException("Only cash payments are accepted at checkout.");

        var changeAmount = Math.Round(Math.Max(0, request.PaidAmount - netTotal), 2);
        var collectedAmount = Math.Round(Math.Max(0, request.PaidAmount - changeAmount), 2);
        var amountDue = Math.Round(Math.Max(0, netTotal - collectedAmount), 2);
        var paymentStatus = amountDue > 0 ? PaymentStatus.Pending : PaymentStatus.Completed;

        await using var transaction = await _unitOfWork.BeginTransactionAsync();
        try
        {
            var customerName = request.CustomerName?.Trim();
            var customerFatherName = request.CustomerFatherName?.Trim();
            var customerPhone = NormalizeMobile(request.CustomerPhone);
            var customerEmail = request.CustomerEmail?.Trim();
            var requestedAccountNumber = NormalizeAccountNumber(request.CustomerAccountNumber);
            int? customerId = request.CustomerID;

            if (amountDue > 0)
            {
                if (string.IsNullOrWhiteSpace(customerName))
                    throw new InvalidOperationException("Customer name is required to open or use an account.");
                if (string.IsNullOrWhiteSpace(customerFatherName))
                    throw new InvalidOperationException("Father name is required to open or use an account.");
                if (string.IsNullOrWhiteSpace(customerPhone) || !IsValidMobile(customerPhone))
                    throw new InvalidOperationException("A valid mobile number is required to open or use an account.");
            }

            if (!string.IsNullOrWhiteSpace(customerName) && customerName.Length > 100)
                throw new InvalidOperationException("Customer name must be 100 characters or fewer.");
            if (!string.IsNullOrWhiteSpace(customerFatherName) && customerFatherName.Length > 100)
                throw new InvalidOperationException("Father name must be 100 characters or fewer.");
            if (!string.IsNullOrWhiteSpace(customerEmail) && (customerEmail.Length > 100 || !customerEmail.Contains('@')))
                throw new InvalidOperationException("Customer email is not valid.");

            if (customerId.HasValue)
            {
                var customer = await _unitOfWork.Customers.GetByIdAsync(customerId.Value);
                if (customer is null || !customer.IsActive)
                    throw new InvalidOperationException("Selected customer is inactive or does not exist.");
                if (string.IsNullOrWhiteSpace(customer.AccountNumber))
                {
                    customer.AccountNumber = AccountNumberForCustomer(customer.CustomerID);
                    _unitOfWork.Customers.Update(customer);
                    await _unitOfWork.SaveChangesAsync();
                }
            }

            if (!customerId.HasValue && (!string.IsNullOrWhiteSpace(requestedAccountNumber) || !string.IsNullOrWhiteSpace(customerPhone)))
            {
                Customer? existing = null;
                if (!string.IsNullOrWhiteSpace(requestedAccountNumber))
                {
                    existing = await _unitOfWork.Customers.FirstOrDefaultAsync(c =>
                        c.AccountNumber == requestedAccountNumber && c.IsActive);
                    if (existing?.Phone is not null && !string.IsNullOrWhiteSpace(customerPhone) &&
                        NormalizeMobile(existing.Phone) != customerPhone)
                    {
                        throw new InvalidOperationException("Account ID and mobile number do not match the same customer.");
                    }
                }

                if (existing is null && !string.IsNullOrWhiteSpace(customerPhone))
                {
                    var phoneMatches = await _unitOfWork.Customers.FindAsync(c => c.Phone == customerPhone && c.IsActive);
                    existing = phoneMatches.OrderByDescending(c => c.CustomerID).FirstOrDefault();
                }

                if (existing is not null)
                {
                    customerId = existing.CustomerID;
                    if (!string.IsNullOrWhiteSpace(customerName)) existing.FullName = customerName;
                    if (!string.IsNullOrWhiteSpace(customerFatherName)) existing.FatherName = customerFatherName;
                    if (!string.IsNullOrWhiteSpace(customerPhone)) existing.Phone = customerPhone;
                    if (!string.IsNullOrWhiteSpace(customerEmail)) existing.Email = customerEmail;
                    if (string.IsNullOrWhiteSpace(existing.AccountNumber)) existing.AccountNumber = AccountNumberForCustomer(existing.CustomerID);
                    _unitOfWork.Customers.Update(existing);
                    await _unitOfWork.SaveChangesAsync();
                }
            }

            if (!customerId.HasValue && amountDue > 0)
            {
                var customer = new Customer
                {
                    FullName = customerName!,
                    FatherName = customerFatherName,
                    Phone = customerPhone,
                    Email = string.IsNullOrWhiteSpace(customerEmail) ? null : customerEmail,
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow
                };
                await _unitOfWork.Customers.AddAsync(customer);
                await _unitOfWork.SaveChangesAsync();

                customerId = customer.CustomerID;
                customer.AccountNumber = AccountNumberForCustomer(customer.CustomerID);
                _unitOfWork.Customers.Update(customer);
                await _unitOfWork.SaveChangesAsync();
            }

            var invoice = await GenerateInvoiceNumberAsync();
            var sale = new Sale
            {
                InvoiceNumber = invoice,
                UserID = userId,
                CustomerID = customerId,
                SaleDate = DateTime.UtcNow,
                SubTotal = subtotal,
                DiscountAmount = discountAmount,
                DiscountPercent = effectiveDiscountPercent,
                TaxAmount = taxAmount,
                NetTotal = netTotal,
                PaidAmount = request.PaidAmount,
                ChangeAmount = changeAmount,
                PaymentStatus = paymentStatus,
                CreatedAt = DateTime.UtcNow
            };

            await _unitOfWork.Sales.AddAsync(sale);
            await _unitOfWork.SaveChangesAsync();

            foreach (var item in request.Items)
            {
                var product = products.First(p => p.ProductID == item.ProductID);
                if (item.Quantity <= 0) throw new InvalidOperationException("Quantity must be greater than zero.");
                if (product.StockQuantity < item.Quantity)
                    throw new InvalidOperationException($"Insufficient stock for {product.ProductName}.");

                var lineTotal = Math.Round(item.UnitPrice * item.Quantity, 2);
                var lineDiscount = Math.Round(discountAmount * (lineTotal / subtotal), 2);

                var saleItem = new SaleItem
                {
                    SaleID = sale.SaleID,
                    ProductID = product.ProductID,
                    ProductName = product.ProductName,
                    Quantity = item.Quantity,
                    UnitPrice = item.UnitPrice,
                    UnitCost = product.PurchasePrice,
                    LineDiscount = lineDiscount,
                    LineTotal = Math.Max(lineTotal - lineDiscount, 0)
                };
                await _unitOfWork.SaleItems.AddAsync(saleItem);

                var oldStock = product.StockQuantity;
                product.StockQuantity -= item.Quantity;
                _unitOfWork.Products.Update(product);

                var inventoryTransaction = new InventoryTransaction
                {
                    ProductID = product.ProductID,
                    TransactionType = TransactionType.Sale,
                    QuantityChange = -item.Quantity,
                    OldStock = oldStock,
                    NewStock = product.StockQuantity,
                    UserID = userId,
                    Reason = $"Sale {invoice}",
                    SaleID = sale.SaleID,
                    CreatedAt = DateTime.UtcNow
                };
                await _unitOfWork.Inventory.AddAsync(inventoryTransaction);
            }

            if (collectedAmount > 0)
            {
                var payment = new Payment
                {
                    SaleID = sale.SaleID,
                    Amount = collectedAmount,
                    PaymentMethod = PaymentMethod.Cash,
                    ReferenceNo = request.ReferenceNo,
                    PaymentDate = DateTime.UtcNow
                };
                await _unitOfWork.Payments.AddAsync(payment);
            }

            await _unitOfWork.SaveChangesAsync();
            await _auditService.LogAsync(
                userId,
                "SaleCompleted",
                "Sale",
                sale.SaleID.ToString(),
                $"{(paymentStatus == PaymentStatus.Pending ? "Saved pending" : "Completed")} invoice {invoice} for {netTotal:C2}. Due: {amountDue:C2}.");

            await transaction.CommitAsync();
            return sale;
        }
        catch
        {
            await transaction.RollbackAsync();
            throw;
        }
    }

    public async Task<IEnumerable<Sale>> GetTodaySalesAsync() => await _unitOfWork.Sales.GetTodaySalesAsync();

    public async Task<IEnumerable<Sale>> GetSalesByDateRangeAsync(DateTime from, DateTime to) => await _unitOfWork.Sales.GetByDateRangeAsync(from, to);

    public async Task<decimal> GetTotalRevenueForDateAsync(DateTime date) => await _unitOfWork.Sales.GetTotalRevenueForDateAsync(date);

    public async Task<string> GenerateInvoiceNumberAsync()
    {
        var datePrefix = DateTime.UtcNow.ToString("yyyyMMdd");
        var sequence = await _unitOfWork.Sales.GetNextInvoiceSequenceAsync(datePrefix);
        return $"{_configuration.GetValue<string>("AppSettings:InvoicePrefix", "POS")}-{datePrefix}-{sequence:000000}";
    }

    private static string NormalizeMobile(string? value)
    {
        var trimmed = value?.Trim() ?? string.Empty;
        if (trimmed.Length == 0) return string.Empty;
        var cleaned = new string(trimmed.Where(ch => char.IsDigit(ch) || ch == '+').ToArray());
        return cleaned.StartsWith('+')
            ? $"+{cleaned[1..].Replace("+", string.Empty)}"
            : cleaned.Replace("+", string.Empty);
    }

    private static bool IsValidMobile(string value)
    {
        var digits = value.Count(char.IsDigit);
        return digits is >= 7 and <= 15;
    }

    private static string NormalizeAccountNumber(string? value) =>
        new string((value?.Trim().ToUpperInvariant() ?? string.Empty)
            .Where(ch => char.IsAsciiLetterOrDigit(ch) || ch == '-')
            .Take(30)
            .ToArray());

    private static string AccountNumberForCustomer(int customerId) =>
        $"CUS-{customerId:D6}";

    private async Task<decimal> GetMaxAllowedDiscountAsync(int userId)
    {
        var user = await _unitOfWork.Users.GetWithRoleAsync(userId);
        if (user is null) return 0;
        var role = user.Role?.RoleName ?? string.Empty;
        return role switch
        {
            nameof(UserRole.Admin) => _configuration.GetValue<decimal>("AppSettings:AdminMaxDiscountPercent", 100m),
            nameof(UserRole.Manager) => _configuration.GetValue<decimal>("AppSettings:ManagerMaxDiscountPercent", 20m),
            _ => _configuration.GetValue<decimal>("AppSettings:CashierMaxDiscountPercent", 5m)
        };
    }
}
