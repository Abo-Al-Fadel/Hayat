using Backend.Services;
using Hayat.Backend.Configurations;
using Microsoft.Extensions.Options;

namespace Backend.Tests.Services;

/// <summary>
/// Pricing maths. Real pharmacies price cost-plus with a regressive markup, and markup
/// (on cost) is not the same thing as margin (on sell price) - both are covered here.
/// </summary>
public class PricingServiceTests
{
    private static PricingService CreateService(decimal dispensingFee = 0m)
    {
        var settings = new PricingSettings
        {
            MarkupTiers = new List<MarkupTier>
            {
                new() { UpToCost = 10m, MarkupPercent = 40m },
                new() { UpToCost = 50m, MarkupPercent = 25m },
                new() { UpToCost = 200m, MarkupPercent = 15m },
            },
            DefaultMarkupPercent = 10m,
            DispensingFee = dispensingFee,
            RoundToDecimals = 2,
            VolumeDiscountTiers = new List<VolumeDiscountTier>
            {
                new() { MinQuantity = 50, DiscountPercent = 3m },
                new() { MinQuantity = 200, DiscountPercent = 6m },
                new() { MinQuantity = 500, DiscountPercent = 9m },
                new() { MinQuantity = 1000, DiscountPercent = 12m },
            }
        };
        return new PricingService(Options.Create(settings));
    }

    // ── Purchase price (the supplier side) ───────────────────────────────────

    [Fact]
    public void SuggestPurchasePrice_IsAlwaysBelowTheSellPrice()
    {
        var service = CreateService();
        foreach (var sell in new[] { 4m, 12m, 50m, 100m, 250m, 1000m })
        {
            var buy = service.SuggestPurchasePrice(sell);
            Assert.True(buy < sell, $"buy {buy} should be below sell {sell}");
            Assert.True(buy > 0, $"buy {buy} should be positive");
        }
    }

    [Fact]
    public void SuggestPurchasePrice_InvertsSuggestSellPrice()
    {
        var service = CreateService();
        // Round-trip: a cost marked up to retail must come back to the same cost.
        foreach (var cost in new[] { 4.00m, 25.00m, 80.00m, 500.00m })
        {
            var sell = service.SuggestSellPrice(cost);
            Assert.Equal(cost, service.SuggestPurchasePrice(sell));
        }
    }

    [Fact]
    public void SuggestPurchasePrice_PicksTheSelfConsistentBand()
    {
        var service = CreateService();
        // Selling at 50 implies the 25% band: 40 x 1.25 = 50.
        Assert.Equal(40.00m, service.SuggestPurchasePrice(50m));
        // Selling at 100 implies the 15% band: 86.96 x 1.15 ~= 100.
        Assert.Equal(86.96m, service.SuggestPurchasePrice(100m));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-10)]
    public void SuggestPurchasePrice_ReturnsZero_ForNonPositiveSellPrice(decimal sell)
    {
        Assert.Equal(0m, CreateService().SuggestPurchasePrice(sell));
    }

    // ── Volume discounts ─────────────────────────────────────────────────────

    [Theory]
    [InlineData(1, 0)]
    [InlineData(49, 0)]
    [InlineData(50, 3)]
    [InlineData(199, 3)]
    [InlineData(200, 6)]
    [InlineData(499, 6)]
    [InlineData(500, 9)]
    [InlineData(999, 9)]
    [InlineData(1000, 12)]
    [InlineData(50000, 12)]
    public void GetVolumeDiscountPercent_UsesTheHighestBandReached(int quantity, decimal expected)
    {
        Assert.Equal(expected, CreateService().GetVolumeDiscountPercent(quantity));
    }

    [Fact]
    public void SuggestPurchasePrice_GetsCheaperPerUnitAsTheOrderGrows()
    {
        var service = CreateService();
        const decimal sell = 50m;

        var small = service.SuggestPurchasePrice(sell, 10);
        var medium = service.SuggestPurchasePrice(sell, 100);
        var large = service.SuggestPurchasePrice(sell, 300);
        var bulk = service.SuggestPurchasePrice(sell, 1200);

        Assert.True(medium < small, "100 units should beat 10");
        Assert.True(large < medium, "300 units should beat 100");
        Assert.True(bulk < large, "1200 units should beat 300");

        // Base is 40.00; 3% / 6% / 12% off.
        Assert.Equal(40.00m, small);
        Assert.Equal(38.80m, medium);
        Assert.Equal(37.60m, large);
        Assert.Equal(35.20m, bulk);
    }

    [Fact]
    public void SuggestPurchasePrice_StaysBelowSellPrice_EvenAtTheLargestDiscount()
    {
        var service = CreateService();
        foreach (var sell in new[] { 4m, 50m, 250m, 1000m })
        {
            Assert.True(service.SuggestPurchasePrice(sell, 100000) < sell);
        }
    }

    [Fact]
    public void SuggestPurchasePrice_MarginImprovesWithVolume()
    {
        var service = CreateService();
        var singleMargin = service.CalculateMarginPercent(service.SuggestPurchasePrice(50m, 1), 50m);
        var bulkMargin = service.CalculateMarginPercent(service.SuggestPurchasePrice(50m, 1000), 50m);

        Assert.NotNull(singleMargin);
        Assert.NotNull(bulkMargin);
        Assert.True(bulkMargin > singleMargin, "buying in bulk should widen the margin");
    }

    // ── Tier selection ───────────────────────────────────────────────────────

    [Theory]
    [InlineData(1.00, 40)]
    [InlineData(10.00, 40)]   // boundary is inclusive
    [InlineData(10.01, 25)]
    [InlineData(50.00, 25)]
    [InlineData(50.01, 15)]
    [InlineData(200.00, 15)]
    [InlineData(200.01, 10)]  // falls through to the default
    [InlineData(5000.00, 10)]
    public void GetMarkupPercent_PicksTheRegressiveBand(decimal cost, decimal expected)
    {
        var service = CreateService();
        Assert.Equal(expected, service.GetMarkupPercent(cost));
    }

    [Fact]
    public void GetMarkupPercent_HandlesMisorderedTierConfiguration()
    {
        var settings = new PricingSettings
        {
            // Deliberately out of order - config files are hand-edited.
            MarkupTiers = new List<MarkupTier>
            {
                new() { UpToCost = 200m, MarkupPercent = 15m },
                new() { UpToCost = 10m, MarkupPercent = 40m },
                new() { UpToCost = 50m, MarkupPercent = 25m },
            },
            DefaultMarkupPercent = 10m
        };
        var service = new PricingService(Options.Create(settings));

        Assert.Equal(40m, service.GetMarkupPercent(5m));
        Assert.Equal(25m, service.GetMarkupPercent(30m));
        Assert.Equal(15m, service.GetMarkupPercent(150m));
    }

    // ── Suggested selling price ──────────────────────────────────────────────

    [Fact]
    public void SuggestSellPrice_AppliesMarkupToCost()
    {
        var service = CreateService();
        // 4.00 sits in the 40% band -> 4.00 + 1.60
        Assert.Equal(5.60m, service.SuggestSellPrice(4.00m));
        // 25.00 sits in the 25% band -> 25.00 + 6.25
        Assert.Equal(31.25m, service.SuggestSellPrice(25.00m));
        // 80.00 sits in the 15% band -> 80.00 + 12.00
        Assert.Equal(92.00m, service.SuggestSellPrice(80.00m));
        // 500.00 falls through to 10% -> 500.00 + 50.00
        Assert.Equal(550.00m, service.SuggestSellPrice(500.00m));
    }

    [Fact]
    public void SuggestSellPrice_AddsDispensingFeeAfterMarkup()
    {
        var service = CreateService(dispensingFee: 6.00m);
        // 42.00 sits in the 25% band (10 < 42 <= 50): 42.00 + 10.50 + 6.00.
        Assert.Equal(58.50m, service.SuggestSellPrice(42.00m));

        // The fee is added after markup, never marked up itself: a 12% markup on 42.00
        // would be 47.04, so the fee contributes exactly 6.00 and not 6.72.
        var flatTwelvePercent = new PricingService(Options.Create(new PricingSettings
        {
            MarkupTiers = new List<MarkupTier> { new() { UpToCost = 1000m, MarkupPercent = 12m } },
            DispensingFee = 6.00m,
            RoundToDecimals = 2
        }));
        Assert.Equal(53.04m, flatTwelvePercent.SuggestSellPrice(42.00m));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-5)]
    public void SuggestSellPrice_ReturnsZero_ForNonPositiveCost(decimal cost)
    {
        Assert.Equal(0m, CreateService().SuggestSellPrice(cost));
    }

    // ── Markup vs margin ─────────────────────────────────────────────────────

    [Fact]
    public void MarkupAndMargin_AreDifferentMeasures()
    {
        var service = CreateService();
        // Cost 80, sell 100: 25% markup on cost, but only 20% margin on sell price.
        Assert.Equal(25m, service.CalculateMarkupPercent(80m, 100m));
        Assert.Equal(20m, service.CalculateMarginPercent(80m, 100m));
    }

    [Fact]
    public void CalculateMarkupPercent_IsNull_WhenCostUnknown()
    {
        // Undefined rather than infinite - the UI must not report a fake 100% margin.
        Assert.Null(CreateService().CalculateMarkupPercent(0m, 20m));
    }

    [Fact]
    public void CalculateMarginPercent_IsNull_WhenSellPriceIsZero()
    {
        Assert.Null(CreateService().CalculateMarginPercent(5m, 0m));
    }

    [Fact]
    public void CalculateMargin_IsNegative_WhenSellingBelowCost()
    {
        var service = CreateService();
        Assert.Equal(-20m, service.CalculateMarkupPercent(100m, 80m));
        Assert.Equal(-25m, service.CalculateMarginPercent(100m, 80m));
    }

    // ── Weighted average cost ────────────────────────────────────────────────

    [Fact]
    public void WeightedAverageCost_BlendsExistingAndIncomingStock()
    {
        var service = CreateService();
        // 100 units at 2.00 plus 100 units at 4.00 -> 3.00
        Assert.Equal(3.00m, service.WeightedAverageCost(100, 2.00m, 100, 4.00m));
    }

    [Fact]
    public void WeightedAverageCost_WeightsByQuantityNotByPrice()
    {
        var service = CreateService();
        // 900 units at 1.00 plus 100 units at 11.00 -> 2.00, not 6.00
        Assert.Equal(2.00m, service.WeightedAverageCost(900, 1.00m, 100, 11.00m));
    }

    [Fact]
    public void WeightedAverageCost_AdoptsIncomingCost_WhenNoCostRecordedYet()
    {
        var service = CreateService();
        // Existing stock predates cost tracking; averaging against 0 would understate it.
        Assert.Equal(4.00m, service.WeightedAverageCost(50, 0m, 10, 4.00m));
    }

    [Fact]
    public void WeightedAverageCost_AdoptsIncomingCost_WhenNoExistingStock()
    {
        Assert.Equal(7.50m, CreateService().WeightedAverageCost(0, 0m, 20, 7.50m));
    }

    [Fact]
    public void WeightedAverageCost_IsUnchanged_WhenNothingIsReceived()
    {
        Assert.Equal(3.00m, CreateService().WeightedAverageCost(10, 3.00m, 0, 9.00m));
    }

    [Fact]
    public void WeightedAverageCost_TreatsNegativeStockAsZero()
    {
        // Data drift must not drag the average below the incoming cost.
        Assert.Equal(5.00m, CreateService().WeightedAverageCost(-20, 2.00m, 10, 5.00m));
    }
}
