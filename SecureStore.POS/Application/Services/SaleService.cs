using Microsoft.EntityFrameworkCore;
using SecureStore.POS.Application.DTOs;
using SecureStore.POS.Application.Interfaces;
using SecureStore.POS.Domain.Entities;
using SecureStore.POS.Domain.Enums;
using SecureStore.POS.Infrastructure.UnitOfWork;
using SecureStore.POS.Security;

namespace SecureStore.POS.Application.Services;

/// <summary>
/// Handles the complete sale lifecycle.
/// CompleteSaleAsync wraps all steps in a single database transaction —
/// if ANY step fails, the entire transaction is rolled back and no
/// partial sale is persisted. This satisfies the crash-safety requirement.
/// </summary>
public class SaleService : ISaleService
{
    private readonly IUnitOfWork _uow;
    private readonly IAuditService _audit;

    public SaleService(IUnitOfWork uow, IAuditService audit)
    {
        _uow = uow;
        _audit = audit;
    }

    /// <inheritdoc/>
    public async Task<SaleResultDto> CompleteSaleAsync(CompleteSaleDto dto)
    {
        // ── Pre-transaction validation ─────────────────────────────────────
        if (dto.CartItems == null || dto.CartItems.Count == 0)
            return Fail("Cart is empty. Please add products before completing the sale.");

        if (dto.UserID <= 0)
            return Fail("Invalid cashier. Please log in again.");

        // Validate each cart item has sufficient stock BEFORE opening transaction
        foreach (var item in dto.CartItems)
        {
            var product = await _uow.Products.GetByIdAsync(item.ProductID);
            if (product is null || !product.IsActive)
                return Fail($"Product '{item.ProductName}' is no longer available.");

            if (item.Quantity <= 0)
                return Fail($"Quantity for '{item.ProductName}' must be at least 1.");
            if (item.LineDiscount < 0)
                return Fail($"Discount for '{item.ProductName}' cannot be negative.");
            if (item.LineDiscount > product.SellingPrice * item.Quantity)
                return Fail($"Discount for '{item.ProductName}' cannot exceed the line total.");
            item.UnitPrice = product.SellingPrice;
            item.AvailableStock = product.StockQuantity;

            if (product.StockQuantity < item.Quantity)
                return Fail($"Insufficient stock for '{product.ProductName}'. " +
                            $"Available: {product.StockQuantity}, Requested: {item.Quantity}.");
        }

        // Discount permission check
        var (discountOk, discountMsg) = PermissionGuard.ValidateDiscount(dto.DiscountPercent);
        if (!discountOk) return Fail(discountMsg);

        // ── Begin database transaction ─────────────────────────────────────
        await using var transaction = await _uow.BeginTransactionAsync();
        try
        {
            // 1. Calculate totals
            decimal subTotal = dto.CartItems.Sum(i => i.UnitPrice * i.Quantity);
            decimal discountAmount = dto.DiscountAmount > 0
                ? dto.DiscountAmount
                : Math.Round(subTotal * dto.DiscountPercent / 100m, 2);
            if (discountAmount < 0 || discountAmount > subTotal)
                throw new InvalidOperationException("Discount amount must be between zero and the subtotal.");
            if (dto.DiscountPercent < 0 || dto.DiscountPercent > 100)
                throw new InvalidOperationException("Discount percent must be between 0 and 100.");
            if (dto.TaxPercent < 0 || dto.TaxPercent > 100)
                throw new InvalidOperationException("Tax percent must be between 0 and 100.");
            decimal taxAmount = Math.Round((subTotal - discountAmount) * dto.TaxPercent / 100m, 2);
            decimal netTotal = subTotal - discountAmount + taxAmount;
            decimal changeAmount = Math.Round(Math.Max(0, dto.PaidAmount - netTotal), 2);
            decimal collectedAmount = Math.Round(Math.Max(0, dto.PaidAmount - changeAmount), 2);
            decimal amountDue = Math.Round(Math.Max(0, netTotal - collectedAmount), 2);
            var paymentStatus = amountDue > 0 ? PaymentStatus.Pending : PaymentStatus.Completed;

            if (dto.PaidAmount < 0)
                throw new InvalidOperationException("Paid amount cannot be negative.");
            if (dto.PaymentMethod != PaymentMethod.Cash)
                throw new InvalidOperationException("Only cash payments are accepted at checkout.");

            var customerName = dto.CustomerName?.Trim();
            var customerFatherName = dto.CustomerFatherName?.Trim();
            var customerPhone = NormalizeMobile(dto.CustomerPhone);
            var customerEmail = dto.CustomerEmail?.Trim();
            var requestedAccountNumber = NormalizeAccountNumber(dto.CustomerAccountNumber);
            int? customerId = dto.CustomerID;
            string? customerAccountNumber = null;

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
            if (!string.IsNullOrWhiteSpace(customerPhone) && customerPhone.Length > 30)
                throw new InvalidOperationException("Customer phone must be 30 characters or fewer.");
            if (!string.IsNullOrWhiteSpace(customerEmail) && (customerEmail.Length > 100 || !customerEmail.Contains('@')))
                throw new InvalidOperationException("Customer email is not valid.");

            if (customerId.HasValue)
            {
                var customer = await _uow.Customers.GetByIdAsync(customerId.Value);
                if (customer is null || !customer.IsActive)
                    throw new InvalidOperationException("Selected customer is inactive or does not exist.");

                customerAccountNumber = string.IsNullOrWhiteSpace(customer.AccountNumber)
                    ? AccountNumberForCustomer(customer.CustomerID)
                    : customer.AccountNumber;
                if (string.IsNullOrWhiteSpace(customer.AccountNumber))
                {
                    customer.AccountNumber = customerAccountNumber;
                    _uow.Customers.Update(customer);
                    await _uow.SaveChangesAsync();
                }
            }

            if (!customerId.HasValue && (!string.IsNullOrWhiteSpace(requestedAccountNumber) || !string.IsNullOrWhiteSpace(customerPhone)))
            {
                Customer? existing = null;
                if (!string.IsNullOrWhiteSpace(requestedAccountNumber))
                {
                    existing = await _uow.Customers.FirstOrDefaultAsync(c =>
                        c.AccountNumber == requestedAccountNumber && c.IsActive);
                    if (existing?.Phone is not null && !string.IsNullOrWhiteSpace(customerPhone) &&
                        NormalizeMobile(existing.Phone) != customerPhone)
                    {
                        throw new InvalidOperationException("Account ID and mobile number do not match the same customer.");
                    }
                }

                if (existing is null && !string.IsNullOrWhiteSpace(customerPhone))
                {
                    var phoneMatches = await _uow.Customers.FindAsync(c => c.Phone == customerPhone && c.IsActive);
                    existing = phoneMatches.OrderByDescending(c => c.CustomerID).FirstOrDefault();
                }

                if (existing is not null)
                {
                    customerId = existing.CustomerID;
                    customerAccountNumber = string.IsNullOrWhiteSpace(existing.AccountNumber)
                        ? AccountNumberForCustomer(existing.CustomerID)
                        : existing.AccountNumber;
                    if (!string.IsNullOrWhiteSpace(customerName)) existing.FullName = customerName;
                    if (!string.IsNullOrWhiteSpace(customerFatherName)) existing.FatherName = customerFatherName;
                    if (!string.IsNullOrWhiteSpace(customerPhone)) existing.Phone = customerPhone;
                    if (!string.IsNullOrWhiteSpace(customerEmail)) existing.Email = customerEmail;
                    if (string.IsNullOrWhiteSpace(existing.AccountNumber)) existing.AccountNumber = customerAccountNumber;
                    _uow.Customers.Update(existing);
                    await _uow.SaveChangesAsync();
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
                    CreatedAt = DateTime.UtcNow,
                    IsActive = true
                };
                await _uow.Customers.AddAsync(customer);
                await _uow.SaveChangesAsync();

                customerId = customer.CustomerID;
                customerAccountNumber = AccountNumberForCustomer(customer.CustomerID);
                customer.AccountNumber = customerAccountNumber;
                _uow.Customers.Update(customer);
                await _uow.SaveChangesAsync();
            }

            // 2. Generate unique invoice number
            var datePart = DateTime.UtcNow.ToString("yyyyMMdd");
            var seq = await _uow.Sales.GetNextInvoiceSequenceAsync(datePart);
            var invoiceNumber = $"POS-{datePart}-{seq:D6}";

            // 3. INSERT Sale (header)
            var sale = new Sale
            {
                InvoiceNumber = invoiceNumber,
                UserID = dto.UserID,
                CustomerID = customerId,
                SaleDate = DateTime.UtcNow,
                SubTotal = subTotal,
                DiscountAmount = discountAmount,
                DiscountPercent = dto.DiscountPercent,
                TaxAmount = taxAmount,
                NetTotal = netTotal,
                PaidAmount = dto.PaidAmount,
                ChangeAmount = changeAmount,
                PaymentStatus = paymentStatus,
                Notes = dto.Notes,
                CreatedAt = DateTime.UtcNow
            };
            await _uow.Sales.AddAsync(sale);
            await _uow.SaveChangesAsync(); // Get SaleID

            // 4. INSERT SaleItems + UPDATE product stock + INSERT InventoryTransactions
            foreach (var item in dto.CartItems)
            {
                // Re-read product inside transaction for accurate stock
                var product = await _uow.Products.GetByIdAsync(item.ProductID)
                    ?? throw new InvalidOperationException($"Product ID {item.ProductID} not found during transaction.");

                if (product.StockQuantity < item.Quantity)
                    throw new InvalidOperationException(
                        $"Stock conflict for '{product.ProductName}'. " +
                        $"Available: {product.StockQuantity}, Requested: {item.Quantity}.");

                var lineTotal = (product.SellingPrice * item.Quantity) - item.LineDiscount;

                // INSERT SaleItem
                var saleItem = new SaleItem
                {
                    SaleID = sale.SaleID,
                    ProductID = item.ProductID,
                    ProductName = product.ProductName, // snapshot
                    Quantity = item.Quantity,
                    UnitPrice = product.SellingPrice,
                    UnitCost = product.PurchasePrice,
                    LineDiscount = item.LineDiscount,
                    LineTotal = lineTotal
                };
                await _uow.SaleItems.AddAsync(saleItem);

                // UPDATE product stock
                int oldStock = product.StockQuantity;
                product.StockQuantity -= item.Quantity;
                product.UpdatedAt = DateTime.UtcNow;
                _uow.Products.Update(product);

                // INSERT InventoryTransaction
                var invTx = new InventoryTransaction
                {
                    ProductID = product.ProductID,
                    TransactionType = TransactionType.Sale,
                    QuantityChange = -item.Quantity,
                    OldStock = oldStock,
                    NewStock = product.StockQuantity,
                    UserID = dto.UserID,
                    Reason = $"Sale invoice {invoiceNumber}",
                    SaleID = sale.SaleID,
                    CreatedAt = DateTime.UtcNow
                };
                await _uow.Inventory.AddAsync(invTx);
            }

            await _uow.SaveChangesAsync();

            // 5. INSERT Payment record
            if (collectedAmount > 0)
            {
                var payment = new Payment
                {
                    SaleID = sale.SaleID,
                    PaymentMethod = PaymentMethod.Cash,
                    Amount = collectedAmount,
                    PaymentDate = DateTime.UtcNow,
                    ReferenceNo = dto.PaymentReference, // transaction ref only — no card data
                    Notes = null
                };
                await _uow.Payments.AddAsync(payment);
                await _uow.SaveChangesAsync();
            }

            // 6. INSERT AuditLog (inside transaction — if this fails, everything rolls back)
            var auditLog = new AuditLog
            {
                UserID = dto.UserID,
                Action = "SALE_COMPLETED",
                EntityName = "Sale",
                EntityID = sale.SaleID.ToString(),
                Description = $"Sale {invoiceNumber} {(paymentStatus == PaymentStatus.Pending ? "saved with unpaid balance" : "completed")}. Total: {netTotal:C}. " +
                              $"Items: {dto.CartItems.Count}. Discount: {discountAmount:C}. Due: {amountDue:C}.",
                DeviceName = Environment.MachineName,
                CreatedAt = DateTime.UtcNow
            };
            await _uow.AuditLogs.AddAsync(auditLog);
            await _uow.SaveChangesAsync();

            // 7. COMMIT — everything succeeded
            await transaction.CommitAsync();

            AppLogger.LogInfo($"Sale {invoiceNumber} committed. Total: {netTotal:C}. Due: {amountDue:C}. UserID={dto.UserID}");

            return new SaleResultDto(
                true,
                paymentStatus == PaymentStatus.Pending ? "Sale saved with unpaid customer balance." : "Sale completed successfully.",
                sale.SaleID,
                invoiceNumber,
                netTotal,
                changeAmount,
                amountDue,
                paymentStatus.ToString(),
                customerId,
                customerAccountNumber);
        }
        catch (Exception ex)
        {
            // ROLLBACK — no partial sale saved
            try { await transaction.RollbackAsync(); } catch { /* already rolled back */ }
            AppLogger.LogError(ex, $"SaleService.CompleteSaleAsync — ROLLED BACK");
            return Fail($"Sale failed and was fully rolled back. No data was saved. Error: {ex.Message}");
        }
    }

    public async Task<SaleDto?> GetSaleByIdAsync(int saleId)
    {
        var sale = await _uow.Sales.GetWithDetailsAsync(saleId);
        return sale is null ? null : MapToDto(sale);
    }

    public async Task<SaleDto?> GetSaleByInvoiceAsync(string invoiceNumber)
    {
        var sale = await _uow.Sales.GetByInvoiceNumberAsync(invoiceNumber);
        return sale is null ? null : MapToDto(sale);
    }

    public async Task<IEnumerable<SaleDto>> GetTodaySalesAsync()
    {
        var sales = await _uow.Sales.GetTodaySalesAsync();
        return sales.Select(MapToDto);
    }

    public async Task<IEnumerable<SaleDto>> GetSalesByDateRangeAsync(DateTime from, DateTime to)
    {
        var sales = await _uow.Sales.GetByDateRangeAsync(from, to);
        return sales.Select(MapToDto);
    }

    public async Task<(bool success, string message)> VoidSaleAsync(
        int saleId, int adminUserId, string reason)
    {
        await using var transaction = await _uow.BeginTransactionAsync();
        try
        {
            var sale = await _uow.Sales.GetWithDetailsAsync(saleId);
            if (sale is null) return (false, "Sale not found.");
            if (sale.IsVoided) return (false, "Sale is already voided.");

            sale.IsVoided = true;
            sale.PaymentStatus = PaymentStatus.Voided;
            _uow.Sales.Update(sale);

            // Reverse stock for each item
            foreach (var item in sale.SaleItems)
            {
                var product = await _uow.Products.GetByIdAsync(item.ProductID);
                if (product is not null)
                {
                    int oldStock = product.StockQuantity;
                    product.StockQuantity += item.Quantity;
                    product.UpdatedAt = DateTime.UtcNow;
                    _uow.Products.Update(product);

                    await _uow.Inventory.AddAsync(new InventoryTransaction
                    {
                        ProductID = product.ProductID,
                        TransactionType = TransactionType.Void,
                        QuantityChange = item.Quantity,
                        OldStock = oldStock,
                        NewStock = product.StockQuantity,
                        UserID = adminUserId,
                        Reason = $"Void of {sale.InvoiceNumber}: {reason}",
                        SaleID = saleId,
                        CreatedAt = DateTime.UtcNow
                    });
                }
            }

            await _uow.AuditLogs.AddAsync(new AuditLog
            {
                UserID = adminUserId,
                Action = "SALE_VOIDED",
                EntityName = "Sale",
                EntityID = saleId.ToString(),
                Description = $"Sale {sale.InvoiceNumber} voided. Reason: {reason}",
                DeviceName = Environment.MachineName,
                CreatedAt = DateTime.UtcNow
            });

            await _uow.SaveChangesAsync();
            await transaction.CommitAsync();

            return (true, $"Sale {sale.InvoiceNumber} has been voided and stock reversed.");
        }
        catch (Exception ex)
        {
            try { await transaction.RollbackAsync(); } catch { }
            AppLogger.LogError(ex, "SaleService.VoidSaleAsync");
            return (false, $"Void failed: {ex.Message}");
        }
    }

    private static SaleResultDto Fail(string msg) =>
        new(false, msg, null, null, 0, 0);

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

    private static SaleDto MapToDto(Sale s) => new(
        s.SaleID,
        s.InvoiceNumber,
        s.User?.FullName ?? "Unknown",
        s.SaleDate,
        s.SubTotal, s.DiscountAmount, s.DiscountPercent,
        s.TaxAmount, s.NetTotal, s.PaidAmount, s.ChangeAmount,
        s.PaymentStatus.ToString(),
        s.IsVoided,
        s.SaleItems.Select(si => new SaleItemDto(
            si.ProductID, si.ProductName, si.Quantity,
            si.UnitPrice, si.LineDiscount, si.LineTotal)).ToList());

}
