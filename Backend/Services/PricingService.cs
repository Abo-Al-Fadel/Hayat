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

    public decimal SuggestPurchasePrice(decimal sellPrice)
    {
        if (sellPrice <= 0) return 0m;

        // Inverse of SuggestSellPrice. The markup band depends on the cost, which is the
        // unknown, so each band is tested for self-consistency: divide the retail price
        // by that band's markup and keep the first result that actually falls inside the
        // band it came from.
        var netOfFee = Math.Max(sellPrice - _settings.DispensingFee, 0m);
        if (netOfFee <= 0) return 0m;

        foreach (var tier in _settings.MarkupTiers.OrderBy(t => t.UpToCost))
        {
            var candidate = netOfFee / (1m + tier.MarkupPercent / 100m);
            if (candidate <= tier.UpToCost)
                return Math.Round(candidate, _settings.RoundToDecimals, MidpointRounding.AwayFromZero);
        }

        var fallback = netOfFee / (1m + _settings.DefaultMarkupPercent / 100m);
        return Math.Round(fallback, _settings.RoundToDecimals, MidpointRounding.AwayFromZero);
    }

    public decimal GetVolumeDiscountPercent(int quantity)
    {
        if (quantity <= 0 || _settings.VolumeDiscountTiers.Count == 0) return 0m;

        // Highest threshold the order size satisfies.
        var tier = _settings.VolumeDiscountTiers
            .Where(t => quantity >= t.MinQuantity)
            .OrderByDescending(t => t.MinQuantity)
            .FirstOrDefault();

        return tier?.DiscountPercent ?? 0m;
    }

    public decimal SuggestPurchasePrice(decimal sellPrice, int quantity)
    {
        var basePrice = SuggestPurchasePrice(sellPrice);
        if (basePrice <= 0) return 0m;

        var discount = GetVolumeDiscountPercent(quantity);
        var discounted = basePrice * (1m - discount / 100m);

        return Math.Round(Math.Max(discounted, 0m), _settings.RoundToDecimals, MidpointRounding.AwayFromZero);
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
