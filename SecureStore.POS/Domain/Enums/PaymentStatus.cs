namespace SecureStore.POS.Domain.Enums;

public enum PaymentStatus
{
    Pending = 1,
    Completed = 2,
    Refunded = 3,
    Voided = 4,
    PartialRefund = 5
}
