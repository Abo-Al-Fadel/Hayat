using Hayat.Backend.Dtos.Stats;
using Hayat.Backend.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace Backend.Services;

/// <inheritdoc />
public class StatsService : IStatsService
{
    private readonly PharmacyDbContext _context;

    public StatsService(PharmacyDbContext context)
    {
        _context = context;
    }

    public async Task<FinancialStatsDto> GetFinancialStatsAsync(DateTime fromUtc, DateTime toUtc, int topMedicinesCount = 5)
    {
        topMedicinesCount = Math.Clamp(topMedicinesCount, 1, 50);

        // Cancelled orders have their items removed and total zeroed, so they are
        // excluded rather than counted as zero-value sales.
        var ordersQuery = _context.Orders
            .AsNoTracking()
            .Where(o => o.Status != OrderStatus.Cancelled
                        && o.CreatedAt >= fromUtc
                        && o.CreatedAt <= toUtc);

        var lineItems = await ordersQuery
            .SelectMany(o => o.Items.Select(i => new
            {
                o.Id,
                o.CreatedAt,
                i.MedicineId,
                MedicineName = i.Medicine.Name,
                i.Quantity,
                i.Price,
                i.CostPrice
            }))
            .ToListAsync();

        var revenue = lineItems.Sum(i => i.Price * i.Quantity);
        var cogs = lineItems.Sum(i => i.CostPrice * i.Quantity);
        var grossProfit = revenue - cogs;

        // Lines whose cost was never recorded (medicine never received via a supply
        // order) would otherwise masquerade as pure profit.
        var revenueWithUnknownCost = lineItems
            .Where(i => i.CostPrice <= 0)
            .Sum(i => i.Price * i.Quantity);

        var orderCount = lineItems.Select(i => i.Id).Distinct().Count();
        var unitsSold = lineItems.Sum(i => i.Quantity);

        var revenueByDay = lineItems
            .GroupBy(i => i.CreatedAt.Date)
            .OrderBy(g => g.Key)
            .Select(g => new DailyRevenuePointDto
            {
                Date = g.Key,
                Revenue = g.Sum(i => i.Price * i.Quantity),
                GrossProfit = g.Sum(i => (i.Price - i.CostPrice) * i.Quantity),
                OrderCount = g.Select(i => i.Id).Distinct().Count()
            })
            .ToList();

        var topMedicines = lineItems
            .GroupBy(i => new { i.MedicineId, i.MedicineName })
            .Select(g =>
            {
                var medRevenue = g.Sum(i => i.Price * i.Quantity);
                var medProfit = g.Sum(i => (i.Price - i.CostPrice) * i.Quantity);
                return new TopMedicineDto
                {
                    MedicineId = g.Key.MedicineId,
                    Name = g.Key.MedicineName,
                    UnitsSold = g.Sum(i => i.Quantity),
                    Revenue = medRevenue,
                    GrossProfit = medProfit,
                    GrossMarginPercent = medRevenue > 0
                        ? Math.Round(medProfit / medRevenue * 100m, 2, MidpointRounding.AwayFromZero)
                        : null
                };
            })
            .OrderByDescending(m => m.Revenue)
            .Take(topMedicinesCount)
            .ToList();

        // Inventory snapshot reads Medicine.Quantity, which is the real stock figure.
        var inventory = await _context.Medicines
            .AsNoTracking()
            .Select(m => new { m.Quantity, m.Price, m.CostPrice, m.LowStockThreshold })
            .ToListAsync();

        var inventoryAtCost = inventory.Sum(m => m.CostPrice * m.Quantity);
        var inventoryAtRetail = inventory.Sum(m => m.Price * m.Quantity);

        return new FinancialStatsDto
        {
            FromUtc = fromUtc,
            ToUtc = toUtc,

            Revenue = Round(revenue),
            CostOfGoodsSold = Round(cogs),
            GrossProfit = Round(grossProfit),
            GrossMarginPercent = revenue > 0
                ? Math.Round(grossProfit / revenue * 100m, 2, MidpointRounding.AwayFromZero)
                : null,
            OrderCount = orderCount,
            UnitsSold = unitsSold,
            AverageOrderValue = orderCount > 0 ? Round(revenue / orderCount) : 0m,
            RevenueWithUnknownCost = Round(revenueWithUnknownCost),

            InventoryValueAtCost = Round(inventoryAtCost),
            InventoryValueAtRetail = Round(inventoryAtRetail),
            PotentialProfit = Round(inventoryAtRetail - inventoryAtCost),
            InventoryUnits = inventory.Sum(m => m.Quantity),
            LowStockCount = inventory.Count(m => m.Quantity > 0 && m.Quantity <= m.LowStockThreshold),
            OutOfStockCount = inventory.Count(m => m.Quantity <= 0),

            RevenueByDay = revenueByDay,
            TopMedicines = topMedicines
        };
    }

    private static decimal Round(decimal value) => Math.Round(value, 2, MidpointRounding.AwayFromZero);
}
