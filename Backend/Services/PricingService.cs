using Hayat.Backend.Configurations;
using Hayat.Backend.Interfaces;
using Microsoft.Extensions.Options;

namespace Backend.Services;

/// <inheritdoc />
public class PricingService : IPricingService
{
    private readonly PricingSettings _settings;

    public PricingService(IOptions<PricingSettings> settings)
    {
        _settings = settings.Value;
    }

    public decimal GetMarkupPercent(decimal unitCost)
    {
        if (unitCost <= 0) return _settings.DefaultMarkupPercent;

        // First band whose ceiling covers this cost wins; tiers are sorted defensively
        // so a mis-ordered config file still behaves predictably.
        var tier = _settings.MarkupTiers
            .OrderBy(t => t.UpToCost)
            .FirstOrDefault(t => unitCost <= t.UpToCost);

        return tier?.MarkupPercent ?? _settings.DefaultMarkupPercent;
    }

    public decimal SuggestSellPrice(decimal unitCost)
    {
        if (unitCost <= 0) return 0m;

        var markup = GetMarkupPercent(unitCost);
        var price = unitCost + (unitCost * markup / 100m) + _settings.DispensingFee;

        return Math.Round(price, _settings.RoundToDecimals, MidpointRounding.AwayFromZero);
    }

    public decimal? CalculateMarkupPercent(decimal unitCost, decimal sellPrice)
    {
        if (unitCost <= 0) return null;
        return Math.Round((sellPrice - unitCost) / unitCost * 100m, 2, MidpointRounding.AwayFromZero);
    }

    public decimal? CalculateMarginPercent(decimal unitCost, decimal sellPrice)
    {
        if (sellPrice <= 0) return null;
        return Math.Round((sellPrice - unitCost) / sellPrice * 100m, 2, MidpointRounding.AwayFromZero);
    }

    public decimal WeightedAverageCost(int existingQuantity, decimal existingCost, int incomingQuantity, decimal incomingCost)
    {
        if (incomingQuantity <= 0) return existingCost;

        // Negative stock (data drift) must not drag the average below zero.
        var safeExisting = Math.Max(existingQuantity, 0);
        var totalQuantity = safeExisting + incomingQuantity;
        if (totalQuantity <= 0) return incomingCost;

        // A medicine with no recorded cost yet simply adopts the incoming cost rather
        // than averaging against a meaningless zero.
        if (existingCost <= 0 || safeExisting == 0) return Math.Round(incomingCost, 4, MidpointRounding.AwayFromZero);

        var blended = ((safeExisting * existingCost) + (incomingQuantity * incomingCost)) / totalQuantity;
        return Math.Round(blended, 4, MidpointRounding.AwayFromZero);
    }
}
