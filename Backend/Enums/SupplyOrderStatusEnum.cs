public enum SupplyOrderStatusEnum
{
    Created = 1,        // Owner created order
    Approved = 2,       // Approved internally
    Ordered = 3,        // Sent to supplier
    Shipped = 4,        // Supplier shipped
    Received = 5,       // Arrived at pharmacy
    Stored = 6,         // Added to storage / inventory
    Cancelled = 7
}
