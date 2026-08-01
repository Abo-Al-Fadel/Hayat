namespace Hayat.Backend.Configurations;

/// <summary>
/// Retail pricing rules, bound from the "Pricing" configuration section.
///
/// Real pharmacies price cost-plus and use a *regressive* markup: a higher percentage
/// on cheap items and a lower percentage on expensive ones. A flat percentage
/// over-rewards expensive drugs while making cheap essentials needlessly costly, which
/// is why regulated markets (France, Sweden, Latvia) mandate regressive schedules.
///
/// Nothing here is hardcoded in the pricing logic - change the tiers in appsettings
/// (or per environment) without touching code.
/// </summary>
public class PricingSettings
{
    public const string SectionName = "Pricing";

    /// <summary>
    /// Markup bands, ordered by ascending <see cref="MarkupTier.UpToCost"/>.
    /// The first tier whose threshold is greater than or equal to the unit cost wins.
    /// </summary>
    public List<MarkupTier> MarkupTiers { get; set; } = new();

    /// <summary>
    /// Percentage applied when a unit cost is above every configured tier.
    /// </summary>
    public decimal DefaultMarkupPercent { get; set; } = 10m;

    /// <summary>
    /// Flat per-item fee added after markup. Set to 0 to disable.
    /// </summary>
    public decimal DispensingFee { get; set; }

    /// <summary>
    /// Rounds suggested prices to this many decimal places.
    /// </summary>
    public int RoundToDecimals { get; set; } = 2;
}

public class MarkupTier
{
    /// <summary>Inclusive upper bound of unit cost for this band.</summary>
    public decimal UpToCost { get; set; }

    /// <summary>Markup applied to the cost, as a percentage of cost (not of sell price).</summary>
    public decimal MarkupPercent { get; set; }
}
