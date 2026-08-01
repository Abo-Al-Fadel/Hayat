using Hayat.Backend.Dtos.Stats;

namespace Hayat.Backend.Interfaces;

public interface IStatsService
{
    /// <summary>
    /// Financial summary for sales between <paramref name="fromUtc"/> and
    /// <paramref name="toUtc"/>, plus a snapshot of inventory value as of now.
    /// </summary>
    Task<FinancialStatsDto> GetFinancialStatsAsync(DateTime fromUtc, DateTime toUtc, int topMedicinesCount = 5);
}
