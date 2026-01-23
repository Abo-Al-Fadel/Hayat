using Microsoft.EntityFrameworkCore;

/// <summary>
/// Service for managing supply orders with proper status transitions
/// 
/// Status Flow:
/// Created → Approved → Ordered → Shipped → Received → Stored
///                                    ↓
///                              Cancelled (only before Shipped)
/// 
/// Inventory Update Logic:
/// When status changes to "Stored", the ordered quantities are atomically
/// added to the pharmacy's main stock (Medicines table quantity field).
/// </summary>
public class SupplyOrderService : ISupplyOrderService
{
    private readonly PharmacyDbContext _context;

    public SupplyOrderService(PharmacyDbContext context)
    {
        _context = context;
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
            // Map items with UnitPrice (BUY price) from stored supply order data
            Items = order.Items.Select(i => new SupplyOrderItemDto
            {
                MedicineId = i.MedicineId,
                MedicineName = i.Medicine?.Name ?? "",
                Quantity = i.Quantity,
                UnitPrice = i.UnitPrice  // BUY price stored with supply order
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
        var orders = await _context.SupplyOrders
            .Include(o => o.Supplier)
            .Include(o => o.Items)
                .ThenInclude(i => i.Medicine)
            .OrderByDescending(o => o.CreatedAt)
            .ToListAsync();

        return orders.Select(MapToDto).ToList();
    }

    // Get active orders (excludes Stored and Cancelled for better performance)
    public async Task<List<SupplyOrderDto>> GetActiveOrdersAsync()
    {
        var orders = await _context.SupplyOrders
            .Include(o => o.Supplier)
            .Include(o => o.Items)
                .ThenInclude(i => i.Medicine)
            .Where(o => o.Status != SupplyOrderStatusEnum.Stored && 
                       o.Status != SupplyOrderStatusEnum.Cancelled)
            .OrderByDescending(o => o.CreatedAt)
            .ToListAsync();

        return orders.Select(MapToDto).ToList();
    }

    // Get by ID
    public async Task<SupplyOrderDto?> GetByIdAsync(int id)
    {
        var order = await _context.SupplyOrders
            .Include(o => o.Supplier)
            .Include(o => o.Items)
                .ThenInclude(i => i.Medicine)
            .FirstOrDefaultAsync(o => o.Id == id);

        return order != null ? MapToDto(order) : null;
    }

    // Get by status
    public async Task<List<SupplyOrderDto>> GetByStatusAsync(SupplyOrderStatusEnum status)
    {
        var orders = await _context.SupplyOrders
            .Include(o => o.Supplier)
            .Include(o => o.Items)
                .ThenInclude(i => i.Medicine)
            .Where(o => o.Status == status)
            .OrderByDescending(o => o.CreatedAt)
            .ToListAsync();

        return orders.Select(MapToDto).ToList();
    }

    /// <summary>
    /// Update supply order status with validation and date tracking
    /// 
    /// Status Transition Rules:
    /// - Created → Approved (Admin)
    /// - Approved → Ordered (Admin)
    /// - Ordered → Shipped (StorageManager)
    /// - Shipped → Received (StorageManager)
    /// - Received → Stored (StorageManager) - triggers inventory update
    /// - Any before Shipped → Cancelled (Admin)
    /// </summary>
    public async Task<SupplyOrderDto> UpdateStatusAsync(int id, SupplyOrderStatusEnum newStatus)
    {
        var order = await _context.SupplyOrders
            .Include(o => o.Supplier)
            .Include(o => o.Items)
                .ThenInclude(i => i.Medicine)
            .FirstOrDefaultAsync(o => o.Id == id);

        if (order == null)
            throw new Exception("Supply order not found");

        // Validate status transition
        ValidateStatusTransition(order.Status, newStatus);

        // Update status and set appropriate timestamp
        var now = DateTime.UtcNow;
        order.Status = newStatus;

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
                // IMPORTANT: Add quantities to main inventory
                await AddToInventoryAsync(order);
                break;
            case SupplyOrderStatusEnum.Cancelled:
                order.CancelledAt = now;
                break;
        }

        await _context.SaveChangesAsync();
        return MapToDto(order);
    }

    // Validate that the status transition is allowed
    private void ValidateStatusTransition(SupplyOrderStatusEnum current, SupplyOrderStatusEnum next)
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

    /// <summary>
    /// Add ordered quantities to pharmacy main inventory (Medicine.Quantity)
    /// This is called atomically when status changes to "Stored"
    /// </summary>
    private async Task AddToInventoryAsync(SupplyOrder order)
    {
        foreach (var item in order.Items)
        {
            var medicine = await _context.Medicines.FindAsync(item.MedicineId);
            if (medicine != null)
            {
                medicine.Quantity += item.Quantity;
            }
        }
        // Changes are saved by the caller (UpdateStatusAsync)
    }

    /// <summary>
    /// Update a supply order (only allowed when status is Created)
    /// Edit Restrictions: Cannot edit after approval
    /// </summary>
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

    // Legacy method - now uses UpdateStatusAsync internally
    public async Task MarkAsReceivedAsync(int supplyOrderId)
    {
        await UpdateStatusAsync(supplyOrderId, SupplyOrderStatusEnum.Received);
    }
}
