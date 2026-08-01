namespace Hayat.Backend.Dtos.Stats;

/// <summary>Money figures for the Admin dashboard, over a requested period.</summary>
public class FinancialStatsDto
{
    public DateTime FromUtc { get; set; }
    public DateTime ToUtc { get; set; }

    // ── Sales in the period ──────────────────────────────────────────────────
    public decimal Revenue { get; set; }

    /// <summary>Cost of goods sold, from the cost snapshotted on each order line.</summary>
    public decimal CostOfGoodsSold { get; set; }

    public decimal GrossProfit { get; set; }

    /// <summary>Gross profit as a percentage of revenue. Null when there was no revenue.</summary>
    public decimal? GrossMarginPercent { get; set; }

    public int OrderCount { get; set; }
    public int UnitsSold { get; set; }
    public decimal AverageOrderValue { get; set; }

    /// <summary>
    /// Share of revenue whose cost is unknown because the medicine was never received
    /// through a supply order. Profit is understated by an unknown amount while this is
    /// above zero, so the UI should say so rather than quietly reporting 100% margin.
    /// </summary>
    public decimal RevenueWithUnknownCost { get; set; }

    // ── Inventory as it stands right now ─────────────────────────────────────
    public decimal InventoryValueAtCost { get; set; }
    public decimal InventoryValueAtRetail { get; set; }

    /// <summary>Profit still sitting on the shelves if all current stock sells at list price.</summary>
    public decimal PotentialProfit { get; set; }

    public int InventoryUnits { get; set; }
    public int LowStockCount { get; set; }
    public int OutOfStockCount { get; set; }

    public List<DailyRevenuePointDto> RevenueByDay { get; set; } = new();
    public List<TopMedicineDto> TopMedicines { get; set; } = new();
}

public class DailyRevenuePointDto
{
    public DateTime Date { get; set; }
    public decimal Revenue { get; set; }
    public decimal GrossProfit { get; set; }
    public int OrderCount { get; set; }
}

public class TopMedicineDto
{
    public int MedicineId { get; set; }
    public string Name { get; set; } = string.Empty;
    public int UnitsSold { get; set; }
    public decimal Revenue { get; set; }
    public decimal GrossProfit { get; set; }
    public decimal? GrossMarginPercent { get; set; }
}
