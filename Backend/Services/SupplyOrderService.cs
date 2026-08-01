using Backend.Services;
using Hayat.Backend.Interfaces;
using Microsoft.EntityFrameworkCore;

public class SupplyOrderService : ISupplyOrderService
{
    private readonly PharmacyDbContext _context;
    private readonly INotificationService _notificationService;
    private readonly IPricingService _pricingService;

    public SupplyOrderService(
        PharmacyDbContext context,
        INotificationService notificationService,
        IPricingService pricingService)
    {
        _context = context;
        _notificationService = notificationService;
        _pricingService = pricingService;
    }

    // Helper: Map entity to DTO
    private SupplyOrderDto MapToDto(SupplyOrder order)
    {
        return new SupplyOrderDto
        {
            Id = order.Id,
            CreatedAt = order.CreatedAt,
            ApprovedAt = order.ApprovedAt,
            OrderedAt = order.OrderedAt,
            ShippedAt = order.ShippedAt,
            ReceivedAt = order.ReceivedAt,
            StoredAt = order.StoredAt,
            CancelledAt = order.CancelledAt,
            SupplierId = order.SupplierId,
            SupplierName = order.Supplier?.Name ?? "",
            Status = order.Status,
            Notes = order.Notes,

            Items = order.Items.Select(i => new SupplyOrderItemDto
            {
                MedicineId = i.MedicineId,
                MedicineName = i.Medicine?.Name ?? "",
                Quantity = i.Quantity,
                UnitPrice = i.UnitPrice,
                MedicineImageUrl = i.Medicine?.Image
            }).ToList()
        };
    }

    // Create a new supply order
    public async Task<SupplyOrderDto> CreateOrderAsync(CreateSupplyOrderDto dto)
    {
        if (dto == null)
            throw new ArgumentNullException(nameof(dto));

        var supplier = await _context.Suppliers.FindAsync(dto.SupplierId);
        if (supplier == null)
            throw new Exception("Supplier not found");

        var medicineIds = dto.Items.Select(i => i.MedicineId).ToList();
        var medicines = await _context.Medicines
            .Where(m => medicineIds.Contains(m.Id))
            .ToDictionaryAsync(m => m.Id);

        // Reject unknown medicine ids up front. Without this the null-forgiving
        // Medicine assignment below surfaced later as an opaque FK violation.
        var missingIds = medicineIds.Where(id => !medicines.ContainsKey(id)).Distinct().ToList();
        if (missingIds.Count > 0)
            throw new InvalidOperationException($"Medicine(s) not found: {string.Join(", ", missingIds)}");

        var order = new SupplyOrder
        {
            CreatedAt = DateTime.UtcNow,
            Status = SupplyOrderStatusEnum.Created,
            SupplierId = supplier.Id,
            Supplier = supplier,
            Notes = dto.Notes,
            // Store items with UnitPrice (BUY price from frontend)
            Items = dto.Items.Select(i => new SupplyOrderItem
            {
                MedicineId = i.MedicineId,
                Medicine = medicines.GetValueOrDefault(i.MedicineId)!,
                Quantity = i.Quantity,
                UnitPrice = i.UnitPrice  // BUY price from supplier
            }).ToList()
        };

        _context.SupplyOrders.Add(order);
        await _context.SaveChangesAsync();

        return MapToDto(order);
    }

    // Get all supply orders
    public async Task<List<SupplyOrderDto>> GetAllAsync()
    {
        // AsNoTracking for read-only listing (better performance)
        var orders = await _context.SupplyOrders
            .AsNoTracking()
            .Include(o => o.Supplier)
            .Include(o => o.Items)
                .ThenInclude(i => i.Medicine)
            .OrderByDescending(o => o.CreatedAt)
            .ToListAsync();

        return orders.Select(MapToDto).ToList();
    }

    // Get active orders (includes Stored so Admin can delete, excludes only Cancelled)
    public async Task<List<SupplyOrderDto>> GetActiveOrdersAsync()
    {
        // AsNoTracking for read-only listing (better performance)
        var orders = await _context.SupplyOrders
            .AsNoTracking()
            .Include(o => o.Supplier)
            .Include(o => o.Items)
                .ThenInclude(i => i.Medicine)
            .Where(o => o.Status != SupplyOrderStatusEnum.Cancelled)
            .OrderByDescending(o => o.CreatedAt)
            .ToListAsync();

        return orders.Select(MapToDto).ToList();
    }

    // Get by ID
    public async Task<SupplyOrderDto?> GetByIdAsync(int id)
    {
        // AsNoTracking for read-only query (better performance)
        var order = await _context.SupplyOrders
            .AsNoTracking()
            .Include(o => o.Supplier)
            .Include(o => o.Items)
                .ThenInclude(i => i.Medicine)
            .FirstOrDefaultAsync(o => o.Id == id);

        return order != null ? MapToDto(order) : null;
    }

    // Get by status
    public async Task<List<SupplyOrderDto>> GetByStatusAsync(SupplyOrderStatusEnum status)
    {
        // AsNoTracking for read-only listing (better performance)
        var orders = await _context.SupplyOrders
            .AsNoTracking()
            .Include(o => o.Supplier)
            .Include(o => o.Items)
                .ThenInclude(i => i.Medicine)
            .Where(o => o.Status == status)
            .OrderByDescending(o => o.CreatedAt)
            .ToListAsync();

        return orders.Select(MapToDto).ToList();
    }
    public async Task<SupplyOrderDto> UpdateStatusAsync(int id, SupplyOrderStatusEnum newStatus, AppRole? actorRole = null)
    {
        var order = await _context.SupplyOrders
            .Include(o => o.Supplier)
            .Include(o => o.Items)
                .ThenInclude(i => i.Medicine)
            .FirstOrDefaultAsync(o => o.Id == id);

        if (order == null)
            throw new Exception("Supply order not found");

        // Store old status for notification
        var oldStatus = order.Status;

        // Validate status transition
        ValidateStatusTransition(order.Status, newStatus);

        // Validate the actor is allowed to drive this particular transition.
        ValidateActorMaySetStatus(newStatus, actorRole);

        // Update status and set appropriate timestamp
        var now = DateTime.UtcNow;
        order.Status = newStatus;

        // Track stock changes for broadcasting
        List<(int MedicineId, string MedicineName, int NewQuantity, int AddedQuantity)>? stockChanges = null;

        switch (newStatus)
        {
            case SupplyOrderStatusEnum.Approved:
                order.ApprovedAt = now;
                break;
            case SupplyOrderStatusEnum.Ordered:
                order.OrderedAt = now;
                break;
            case SupplyOrderStatusEnum.Shipped:
                order.ShippedAt = now;
                break;
            case SupplyOrderStatusEnum.Received:
                order.ReceivedAt = now;
                break;
            case SupplyOrderStatusEnum.Stored:
                order.StoredAt = now;
                // IMPORTANT: Add quantities to main inventory and capture changes
                stockChanges = await AddToInventoryAsync(order);
                break;
            case SupplyOrderStatusEnum.Cancelled:
                order.CancelledAt = now;
                break;
        }

        await _context.SaveChangesAsync();

        // Send real-time notification if actor role is provided
        if (actorRole.HasValue)
        {
            // GUARD: Skip if status didn't actually change
            if (oldStatus == newStatus)
            {
                return MapToDto(order);
            }

            // Notify when order becomes visible to Storage Manager (Ordered status)
            // This is a "new order" notification - DO NOT also send status changed
            if (newStatus == SupplyOrderStatusEnum.Ordered && oldStatus == SupplyOrderStatusEnum.Approved)
            {
                await _notificationService.NotifySupplyOrderCreatedAsync(order);
            }
            else
            {
                // Notify status changes for OTHER transitions only
                // This prevents duplicate notifications when order is first created
                await _notificationService.NotifySupplyOrderStatusChangedAsync(order, oldStatus, actorRole.Value);
            }

            // CRITICAL: When stock is stored, broadcast StockUpdated to ALL roles (Admin, StorageManager, Pharmacist)
            // This ensures Pharmacist dashboard updates in real-time
            if (newStatus == SupplyOrderStatusEnum.Stored && stockChanges != null && stockChanges.Count > 0)
            {
                // BroadcastStockUpdateAsync → Admin + StorageManager (supply logistics event)
                await _notificationService.BroadcastStockUpdateAsync(order, stockChanges);

                // NotifyInventoryStockIncreasedAsync → Pharmacist + Admin (inventory replenishment event)
                // Pharmacist needs to know stock is available for sales
                await _notificationService.NotifyInventoryStockIncreasedAsync(order, stockChanges);
            }
        }

        return MapToDto(order);
    }

    /// <summary>
    /// Which role owns each stage of the supply-order lifecycle. The Admin raises and
    /// places the order; the Storage Manager handles physical receipt. This mirrors
    /// canAdminPerformAction / canStorageManagerChangeStatus in the frontend, which
    /// previously enforced the split in the UI only - the API accepted any transition
    /// from either role.
    /// </summary>
    private static readonly Dictionary<SupplyOrderStatusEnum, AppRole> StatusOwner = new()
    {
        [SupplyOrderStatusEnum.Approved] = AppRole.Admin,
        [SupplyOrderStatusEnum.Ordered] = AppRole.Admin,
        [SupplyOrderStatusEnum.Cancelled] = AppRole.Admin,
        [SupplyOrderStatusEnum.Shipped] = AppRole.StorageManager,
        [SupplyOrderStatusEnum.Received] = AppRole.StorageManager,
        [SupplyOrderStatusEnum.Stored] = AppRole.StorageManager,
    };

    private static void ValidateActorMaySetStatus(SupplyOrderStatusEnum newStatus, AppRole? actorRole)
    {
        // A null actor means an internal/legacy call path that has already been
        // authorized by its own endpoint.
        if (actorRole is null) return;

        if (StatusOwner.TryGetValue(newStatus, out var requiredRole) && requiredRole != actorRole.Value)
        {
            throw new UnauthorizedAccessException(
                $"Role '{actorRole}' cannot set supply order status to '{newStatus}'. That transition belongs to '{requiredRole}'.");
        }
    }

    // Validate that the status transition is allowed
    private static void ValidateStatusTransition(SupplyOrderStatusEnum current, SupplyOrderStatusEnum next)
    {
        var validTransitions = new Dictionary<SupplyOrderStatusEnum, SupplyOrderStatusEnum[]>
        {
            [SupplyOrderStatusEnum.Created] = new[] { SupplyOrderStatusEnum.Approved, SupplyOrderStatusEnum.Cancelled },
            [SupplyOrderStatusEnum.Approved] = new[] { SupplyOrderStatusEnum.Ordered, SupplyOrderStatusEnum.Cancelled },
            [SupplyOrderStatusEnum.Ordered] = new[] { SupplyOrderStatusEnum.Shipped, SupplyOrderStatusEnum.Cancelled },
            [SupplyOrderStatusEnum.Shipped] = new[] { SupplyOrderStatusEnum.Received },
            [SupplyOrderStatusEnum.Received] = new[] { SupplyOrderStatusEnum.Stored },
            [SupplyOrderStatusEnum.Stored] = Array.Empty<SupplyOrderStatusEnum>(),
            [SupplyOrderStatusEnum.Cancelled] = Array.Empty<SupplyOrderStatusEnum>(),
        };

        if (!validTransitions.ContainsKey(current) || !validTransitions[current].Contains(next))
        {
            throw new InvalidOperationException(
                $"Invalid status transition from {current} to {next}. " +
                $"Allowed transitions: {string.Join(", ", validTransitions.GetValueOrDefault(current, Array.Empty<SupplyOrderStatusEnum>()))}");
        }
    }

    /// Add ordered quantities to pharmacy main inventory (Medicine.Quantity)
    /// This is called atomically when status changes to "Stored"
    /// Returns list of stock changes for broadcasting to all roles
    private async Task<List<(int MedicineId, string MedicineName, int NewQuantity, int AddedQuantity)>> AddToInventoryAsync(SupplyOrder order)
    {
        var stockChanges = new List<(int MedicineId, string MedicineName, int NewQuantity, int AddedQuantity)>();

        foreach (var item in order.Items)
        {
            var medicine = await _context.Medicines.FindAsync(item.MedicineId);
            if (medicine != null)
            {
                // Blend the purchase cost into the medicine's weighted-average cost
                // BEFORE adding the new units, so the existing quantity is still the
                // pre-receipt figure the average is weighted against. Previously the
                // supplier's UnitPrice was recorded on the supply order and then never
                // used, leaving gross profit incomputable.
                medicine.CostPrice = _pricingService.WeightedAverageCost(
                    existingQuantity: medicine.Quantity,
                    existingCost: medicine.CostPrice,
                    incomingQuantity: item.Quantity,
                    incomingCost: item.UnitPrice);

                medicine.Quantity += item.Quantity;
                stockChanges.Add((medicine.Id, medicine.Name, medicine.Quantity, item.Quantity));
            }
        }
        // Changes are saved by the caller (UpdateStatusAsync)
        return stockChanges;
    }

    /// Update a supply order (only allowed when status is Created)
    /// Edit Restrictions: Cannot edit after approval
    public async Task<SupplyOrderDto> UpdateOrderAsync(int id, UpdateSupplyOrderDto dto)
    {
        var order = await _context.SupplyOrders
            .Include(o => o.Supplier)
            .Include(o => o.Items)
                .ThenInclude(i => i.Medicine)
            .FirstOrDefaultAsync(o => o.Id == id);

        if (order == null)
            throw new Exception("Supply order not found");

        // CRITICAL: Only allow editing when status is "Created"
        if (order.Status != SupplyOrderStatusEnum.Created)
            throw new InvalidOperationException(
                $"Cannot edit supply order with status '{order.Status}'. " +
                "Orders can only be edited when status is 'Created'.");

        // Update supplier if provided
        if (dto.SupplierId.HasValue && dto.SupplierId.Value != order.SupplierId)
        {
            var supplier = await _context.Suppliers.FindAsync(dto.SupplierId.Value);
            if (supplier == null)
                throw new Exception("Supplier not found");

            order.SupplierId = supplier.Id;
            order.Supplier = supplier;
        }

        // Update items if provided
        if (dto.Items != null && dto.Items.Any())
        {
            // Remove old items
            _context.Set<SupplyOrderItem>().RemoveRange(order.Items);

            // Add new items
            var medicineIds = dto.Items.Select(i => i.MedicineId).ToList();
            var medicines = await _context.Medicines
                .Where(m => medicineIds.Contains(m.Id))
                .ToDictionaryAsync(m => m.Id);

            var missingIds = medicineIds.Where(id => !medicines.ContainsKey(id)).Distinct().ToList();
            if (missingIds.Count > 0)
                throw new InvalidOperationException($"Medicine(s) not found: {string.Join(", ", missingIds)}");

            // Update items with UnitPrice (BUY price preserved from edit form)
            order.Items = dto.Items.Select(i => new SupplyOrderItem
            {
                SupplyOrderId = order.Id,
                MedicineId = i.MedicineId,
                Medicine = medicines.GetValueOrDefault(i.MedicineId)!,
                Quantity = i.Quantity,
                UnitPrice = i.UnitPrice  // BUY price from supplier
            }).ToList();
        }

        // Update notes if provided
        if (dto.Notes != null)
            order.Notes = dto.Notes;

        await _context.SaveChangesAsync();
        return MapToDto(order);
    }

    /// Get orders visible to Storage Manager
    /// Only returns orders with status: Ordered, Shipped, Received
    /// (Not Created, Approved, Stored, or Cancelled)
    public async Task<List<SupplyOrderDto>> GetOrdersForStorageManagerAsync()
    {
        // AsNoTracking for read-only listing (better performance)
        var orders = await _context.SupplyOrders
            .AsNoTracking()
            .Include(o => o.Supplier)
            .Include(o => o.Items)
                .ThenInclude(i => i.Medicine)
            .Where(o => o.Status == SupplyOrderStatusEnum.Ordered ||
                       o.Status == SupplyOrderStatusEnum.Shipped ||
                       o.Status == SupplyOrderStatusEnum.Received)
            .OrderByDescending(o => o.CreatedAt)
            .ToListAsync();

        return orders.Select(MapToDto).ToList();
    }

    /// Delete a supply order (only Stored or Cancelled orders can be deleted by Admin)
    /// This permanently removes the order from the database
    public async Task DeleteOrderAsync(int id)
    {
        var order = await _context.SupplyOrders
            .Include(o => o.Items)
            .FirstOrDefaultAsync(o => o.Id == id);

        if (order == null)
            throw new Exception($"Supply order {id} not found");

        // Only allow deletion of Stored or Cancelled orders
        if (order.Status != SupplyOrderStatusEnum.Stored && order.Status != SupplyOrderStatusEnum.Cancelled)
            throw new InvalidOperationException($"Cannot delete order with status '{order.Status}'. Only Stored or Cancelled orders can be deleted.");

        // Remove items first (if cascade delete is not configured)
        _context.SupplyOrderItems.RemoveRange(order.Items);
        // Remove the order
        _context.SupplyOrders.Remove(order);

        await _context.SaveChangesAsync();
    }

    // Legacy method - now uses UpdateStatusAsync internally
    public async Task MarkAsReceivedAsync(int supplyOrderId)
    {
        await UpdateStatusAsync(supplyOrderId, SupplyOrderStatusEnum.Received);
    }
}
