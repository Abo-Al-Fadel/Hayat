// Services/OrderService.cs
using Backend.Services;
using Microsoft.EntityFrameworkCore;
using System.Text;

public class OrderService : IOrderService
{
    private readonly PharmacyDbContext _context;
    private readonly INotificationService _notificationService;

    public OrderService(PharmacyDbContext context, INotificationService notificationService)
    {
        _context = context;
        _notificationService = notificationService;
    }

    public async Task<(bool Success, string? Error, Order Order)> CreateOrderAsync(CheckoutDto dto)
    {
        if (dto.Items == null || !dto.Items.Any())
            return (false, "Order must contain at least one item.", null!);

        var order = new Order
        {
            CreatedAt = DateTime.UtcNow,
            PaymentMethod = dto.PaymentMethod,
            Items = new List<OrderItem>()
        };

        decimal total = 0;
        
        // Track medicines that may hit low stock threshold
        var lowStockChecks = new List<(Medicine Medicine, int PreviousQty, int SoldQty)>();

        foreach (var item in dto.Items)
        {
            var medicine = await _context.Medicines.FindAsync(item.MedicineId);
            if (medicine == null)
                return (false, $"Medicine with ID {item.MedicineId} not found.", null!);
            if (medicine.Quantity < item.Quantity)
                return (false, $"Not enough stock for {medicine.Name}", null!);

            // Capture previous quantity BEFORE deduction for low stock detection
            int previousQty = medicine.Quantity;
            medicine.Quantity -= item.Quantity;
            
            // Track for low stock alert (only check after successful order)
            lowStockChecks.Add((medicine, previousQty, item.Quantity));

            order.Items.Add(new OrderItem
            {
                MedicineId = medicine.Id,
                Quantity = item.Quantity,
                Price = medicine.Price
            });

            total += medicine.Price * item.Quantity;
        }

        order.TotalPrice = total;

        _context.Orders.Add(order);
        await _context.SaveChangesAsync();
        
        // 1. SILENT STOCK UPDATE - Admin sees updated stock immediately (NO notification)
        foreach (var (medicine, previousQty, soldQty) in lowStockChecks)
        {
            await _notificationService.NotifyMedicineStockUpdatedAsync(
                medicine.Id, 
                medicine.Name, 
                medicine.Quantity, 
                soldQty
            );
        }
        
        // 2. LOW STOCK ALERTS - Check each medicine for threshold crossing
        foreach (var (medicine, previousQty, soldQty) in lowStockChecks)
        {
            await _notificationService.NotifyLowStockAlertAsync(medicine, previousQty, soldQty);
        }
        
        // NOTE: NotifyOrderCreatedAsync is now a no-op - Admin doesn't receive sale notifications

        return (true, null, order);
    }

    public async Task<string?> GetInvoiceAsync(int orderId)
    {
        // AsNoTracking for read-only invoice generation
        var order = await _context.Orders
            .AsNoTracking()
            .Include(o => o.Items)
            .ThenInclude(i => i.Medicine)
            .FirstOrDefaultAsync(o => o.Id == orderId);

        if (order == null) return null;

        var invoice = new StringBuilder();
        invoice.AppendLine($"Invoice #{order.Id}");
        invoice.AppendLine($"Date: {order.CreatedAt}");
        invoice.AppendLine("\nItems:");
        foreach (var item in order.Items)
        {
            invoice.AppendLine($"{item.Medicine.Name} - {item.Quantity} x {item.Price} = {item.Quantity * item.Price}");
        }
        invoice.AppendLine($"\nTotal: {order.TotalPrice}");

        return invoice.ToString();
    }

    public async Task<List<object>> GetOrdersAsync()
    {
        // Select projection eliminates need for Include (EF optimizes this)
        return await _context.Orders
            .AsNoTracking()
            .Where(o => o.Status != OrderStatus.Cancelled && o.Items.Any())
            .OrderByDescending(o => o.CreatedAt)
            .Select(o => new
            {
                id = o.Id,
                createdAt = o.CreatedAt,
                totalPrice = o.TotalPrice,
                itemsCount = o.Items.Count
            } as object)
            .ToListAsync();
    }

    public async Task<(bool Success, string? Error, Order? Order)> RemoveOrderItemAsync(int orderId, int itemId)
    {
        var order = await _context.Orders
            .Include(o => o.Items)
            .FirstOrDefaultAsync(o => o.Id == orderId);

        if (order == null) return (false, "Order not found", null);

        var item = order.Items.FirstOrDefault(i => i.Id == itemId);
        if (item == null) return (false, "Item not found in order", null);

        var medicine = await _context.Medicines.FindAsync(item.MedicineId);
        if (medicine != null) medicine.Quantity += item.Quantity;

        order.Items.Remove(item);
        order.TotalPrice = order.Items.Sum(i => i.Price * i.Quantity);

        await _context.SaveChangesAsync();
        return (true, null, order);
    }

    public async Task<(bool Success, string? Error, Order? Order)> UpdateOrderItemQuantityAsync(int orderId, int itemId, int newQuantity)
    {
        if (newQuantity <= 0) return (false, "Quantity must be greater than zero", null);

        var order = await _context.Orders
            .Include(o => o.Items)
            .FirstOrDefaultAsync(o => o.Id == orderId);

        if (order == null) return (false, "Order not found", null);

        var item = order.Items.FirstOrDefault(i => i.Id == itemId);
        if (item == null) return (false, "Item not found in order", null);

        var medicine = await _context.Medicines.FindAsync(item.MedicineId);
        if (medicine == null) return (false, "Medicine not found", null);

        int diff = newQuantity - item.Quantity;
        if (diff > 0 && medicine.Quantity < diff)
            return (false, $"Not enough stock for {medicine.Name}", null);

        medicine.Quantity -= diff;
        item.Quantity = newQuantity;

        order.TotalPrice = order.Items.Sum(i => i.Price * i.Quantity);

        await _context.SaveChangesAsync();

        return (true, null, order);
    }

    public async Task<(bool Success, string Message)> CancelOrderAsync(int orderId)
    {
        var order = await _context.Orders
            .Include(o => o.Items)
            .FirstOrDefaultAsync(o => o.Id == orderId);

        if (order == null)
            return (false, "Order not found.");

        if (!order.Items.Any())
        return (false, "Order has no items and cannot be deleted.");

        order.Status = OrderStatus.Cancelled;
        order.TotalPrice = 0;

        _context.OrderItems.RemoveRange(order.Items);

        await _context.SaveChangesAsync();
        return (true, "Order deleted successfully.");
    }

}
