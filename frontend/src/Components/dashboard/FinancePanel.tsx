// src/Components/dashboard/FinancePanel.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  FinancialStats,
  getFinancialStats,
  formatCurrency,
  formatPercent,
} from "../../Services/StatsService";
import { Spinner } from "../ui/Spinner";

const RANGES = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "1 year", days: 365 },
];

interface MoneyCardProps {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "positive" | "negative" | "warning";
}

function MoneyCard({ label, value, hint, tone = "neutral" }: MoneyCardProps) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "negative"
      ? "text-red-600 dark:text-red-400"
      : tone === "warning"
      ? "text-amber-600 dark:text-amber-400"
      : "text-gray-900 dark:text-gray-100";

  return (
    <div className="p-5 rounded-xl bg-white dark:bg-gray-800 shadow">
      <h3 className="text-sm text-gray-500 dark:text-gray-400">{label}</h3>
      <p className={`text-2xl font-bold mt-1 ${toneClass}`}>{value}</p>
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

/**
 * Simple inline bar chart. Avoids pulling in a charting dependency for what is
 * ultimately a list of daily totals.
 */
function RevenueBars({ data }: { data: FinancialStats["revenueByDay"] }) {
  const max = useMemo(() => Math.max(1, ...data.map((d) => d.revenue)), [data]);

  if (data.length === 0) {
    return <p className="text-sm text-gray-400">No sales in this period.</p>;
  }

  return (
    <div className="flex items-end gap-1 h-40" role="img" aria-label="Daily revenue">
      {data.map((point) => {
        const heightPercent = Math.max(2, (point.revenue / max) * 100);
        return (
          <div
            key={point.date}
            // Capped width so a single day reads as a bar rather than a solid block.
            className="flex-1 max-w-[48px] bg-purple-500/80 hover:bg-purple-500 rounded-t transition-colors min-w-[3px]"
            style={{ height: `${heightPercent}%` }}
            title={`${new Date(point.date).toLocaleDateString()} — ${formatCurrency(
              point.revenue
            )} revenue, ${formatCurrency(point.grossProfit)} profit, ${point.orderCount} order(s)`}
          />
        );
      })}
    </div>
  );
}

export function FinancePanel() {
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<FinancialStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (rangeDays: number) => {
    setLoading(true);
    try {
      setStats(await getFinancialStats(rangeDays));
    } catch {
      toast.error("Failed to load financial stats.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(days);
  }, [days, load]);

  if (loading && !stats) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (!stats) {
    return <p className="text-gray-500">No financial data available.</p>;
  }

  const profitTone = stats.grossProfit > 0 ? "positive" : stats.grossProfit < 0 ? "negative" : "neutral";
  const unknownCostShare =
    stats.revenue > 0 ? (stats.revenueWithUnknownCost / stats.revenue) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Range selector */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-gray-500 dark:text-gray-400 mr-1">Period:</span>
        {RANGES.map((range) => (
          <button
            key={range.days}
            onClick={() => setDays(range.days)}
            aria-pressed={days === range.days}
            className={`px-3 py-1.5 rounded-full text-sm transition ${
              days === range.days
                ? "bg-purple-600 text-white"
                : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600"
            }`}
          >
            {range.label}
          </button>
        ))}
        {loading && <Spinner />}
      </div>

      {/* Honesty banner: profit is understated while any sold item has no recorded cost. */}
      {stats.revenueWithUnknownCost > 0 && (
        <div className="rounded-lg border border-amber-400 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          <strong>{formatCurrency(stats.revenueWithUnknownCost)}</strong> of revenue (
          {unknownCostShare.toFixed(0)}%) came from medicines with no recorded purchase cost,
          so profit below is understated. Cost is recorded when a supply order is marked{" "}
          <em>Stored</em>.
        </div>
      )}

      {/* Sales */}
      <section>
        <h2 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-100">
          Sales — last {days} days
        </h2>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <MoneyCard label="Revenue" value={formatCurrency(stats.revenue)} />
          <MoneyCard label="Cost of goods sold" value={formatCurrency(stats.costOfGoodsSold)} />
          <MoneyCard label="Gross profit" value={formatCurrency(stats.grossProfit)} tone={profitTone} />
          <MoneyCard
            label="Gross margin"
            value={formatPercent(stats.grossMarginPercent)}
            hint="Profit ÷ revenue"
            tone={profitTone}
          />
        </div>
      </section>

      <section>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          <MoneyCard label="Orders" value={String(stats.orderCount)} />
          <MoneyCard label="Units sold" value={String(stats.unitsSold)} />
          <MoneyCard label="Average order value" value={formatCurrency(stats.averageOrderValue)} />
        </div>
      </section>

      {/* Revenue trend */}
      <section className="p-5 rounded-xl bg-white dark:bg-gray-800 shadow">
        <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-100">
          Daily revenue
        </h2>
        <RevenueBars data={stats.revenueByDay} />
      </section>

      {/* Inventory value */}
      <section>
        <h2 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-100">
          Inventory on hand
        </h2>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <MoneyCard
            label="Value at cost"
            value={formatCurrency(stats.inventoryValueAtCost)}
            hint="What you paid for current stock"
          />
          <MoneyCard
            label="Value at retail"
            value={formatCurrency(stats.inventoryValueAtRetail)}
            hint="What it sells for at list price"
          />
          <MoneyCard
            label="Potential profit"
            value={formatCurrency(stats.potentialProfit)}
            hint="If all current stock sells"
            tone="positive"
          />
          <MoneyCard
            label="Units in stock"
            value={String(stats.inventoryUnits)}
            hint={`${stats.lowStockCount} low · ${stats.outOfStockCount} out of stock`}
            tone={stats.outOfStockCount > 0 ? "warning" : "neutral"}
          />
        </div>
      </section>

      {/* Best sellers */}
      <section className="p-5 rounded-xl bg-white dark:bg-gray-800 shadow">
        <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-100">
          Top medicines by revenue
        </h2>
        {stats.topMedicines.length === 0 ? (
          <p className="text-sm text-gray-400">No sales in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                  <th className="py-2 pr-4">Medicine</th>
                  <th className="py-2 pr-4 text-right">Units</th>
                  <th className="py-2 pr-4 text-right">Revenue</th>
                  <th className="py-2 pr-4 text-right">Profit</th>
                  <th className="py-2 text-right">Margin</th>
                </tr>
              </thead>
              <tbody>
                {stats.topMedicines.map((medicine) => (
                  <tr
                    key={medicine.medicineId}
                    className="border-b border-gray-100 dark:border-gray-700/50 last:border-0"
                  >
                    <td className="py-2 pr-4 text-gray-800 dark:text-gray-100">{medicine.name}</td>
                    <td className="py-2 pr-4 text-right">{medicine.unitsSold}</td>
                    <td className="py-2 pr-4 text-right">{formatCurrency(medicine.revenue)}</td>
                    <td
                      className={`py-2 pr-4 text-right ${
                        medicine.grossProfit >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {formatCurrency(medicine.grossProfit)}
                    </td>
                    <td className="py-2 text-right">{formatPercent(medicine.grossMarginPercent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
