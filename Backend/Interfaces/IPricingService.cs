namespace Hayat.Backend.Interfaces;

public interface IPricingService
{
    /// <summary>Markup percentage that applies to the given unit cost, per the configured tiers.</summary>
    decimal GetMarkupPercent(decimal unitCost);

    /// <summary>
    /// Suggested retail price for a unit cost:
    /// cost + (cost x markup%) + dispensing fee.
    /// </summary>
    decimal SuggestSellPrice(decimal unitCost);

    /// <summary>
    /// Markup relative to cost: (sell - cost) / cost. Null when cost is zero,
    /// because markup is undefined rather than infinite.
    /// </summary>
    decimal? CalculateMarkupPercent(decimal unitCost, decimal sellPrice);

    /// <summary>
    /// Margin relative to sell price: (sell - cost) / sell. Null when sell is zero.
    /// Not the same as markup - a 25% markup is a 20% margin.
    /// </summary>
    decimal? CalculateMarginPercent(decimal unitCost, decimal sellPrice);

    /// <summary>
    /// Recalculated weighted-average cost after receiving new stock.
    /// </summary>
    decimal WeightedAverageCost(int existingQuantity, decimal existingCost, int incomingQuantity, decimal incomingCost);
}
