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

        // Profit is only meaningful for lines whose purchase cost was actually recorded.
        // Treating an unrecorded cost as zero reported the entire sale as profit and a
        // 100% margin, which is not a small inaccuracy - it is a fabricated number.
        // Those lines are excluded from the profit figures and surfaced separately.
        var measurable = lineItems.Where(i => i.CostPrice > 0).ToList();

        var measurableRevenue = measurable.Sum(i => i.Price * i.Quantity);
        var cogs = measurable.Sum(i => i.CostPrice * i.Quantity);
        var grossProfit = measurableRevenue - cogs;

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
                GrossProfit = g.Where(i => i.CostPrice > 0).Sum(i => (i.Price - i.CostPrice) * i.Quantity),
                OrderCount = g.Select(i => i.Id).Distinct().Count()
            })
            .ToList();

        var topMedicines = lineItems
            .GroupBy(i => new { i.MedicineId, i.MedicineName })
            .Select(g =>
            {
                var medRevenue = g.Sum(i => i.Price * i.Quantity);
                var priced = g.Where(i => i.CostPrice > 0).ToList();
                var medMeasurableRevenue = priced.Sum(i => i.Price * i.Quantity);
                var medProfit = priced.Sum(i => (i.Price - i.CostPrice) * i.Quantity);
                return new TopMedicineDto
                {
                    MedicineId = g.Key.MedicineId,
                    Name = g.Key.MedicineName,
                    UnitsSold = g.Sum(i => i.Quantity),
                    Revenue = medRevenue,
                    // Null rather than zero: "we do not know" is not "no profit".
                    GrossProfit = medMeasurableRevenue > 0 ? Round(medProfit) : null,
                    GrossMarginPercent = medMeasurableRevenue > 0
                        ? Math.Round(medProfit / medMeasurableRevenue * 100m, 2, MidpointRounding.AwayFromZero)
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
            // Null when nothing in the period had a recorded cost, so the UI can say
            // "unknown" instead of printing revenue again and calling it profit.
            GrossProfit = measurableRevenue > 0 ? Round(grossProfit) : null,
            GrossMarginPercent = measurableRevenue > 0
                ? Math.Round(grossProfit / measurableRevenue * 100m, 2, MidpointRounding.AwayFromZero)
                : null,
            MeasurableRevenue = Round(measurableRevenue),
            OrderCount = orderCount,
            UnitsSold = unitsSold,
            AverageOrderValue = orderCount > 0 ? Round(revenue / orderCount) : 0m,
            RevenueWithUnknownCost = Round(revenueWithUnknownCost),

            InventoryValueAtCost = Round(inventoryAtCost),
            InventoryValueAtRetail = Round(inventoryAtRetail),
            // Without any recorded cost this would just restate the retail value and
            // label it profit, so it is reported as unknown instead.
            PotentialProfit = inventoryAtCost > 0 ? Round(inventoryAtRetail - inventoryAtCost) : null,
            InventoryHasKnownCost = inventoryAtCost > 0,
            InventoryUnits = inventory.Sum(m => m.Quantity),
            LowStockCount = inventory.Count(m => m.Quantity > 0 && m.Quantity <= m.LowStockThreshold),
            OutOfStockCount = inventory.Count(m => m.Quantity <= 0),

            RevenueByDay = revenueByDay,
            TopMedicines = topMedicines
        };
    }

    private static decimal Round(decimal value) => Math.Round(value, 2, MidpointRounding.AwayFromZero);
}
