import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from "recharts";
import { Skeleton } from "../../components/skeleton";
import type { TrendData } from "../../types/dashboard.types";

type Props = {
  data: TrendData | undefined;
  loading: boolean;
  days?: number;
};

export function ViolationChart({ data, loading, days = 7 }: Props) {
  const chartData =
    data?.labels.map((label, i) => ({
      label,
      count: data.data[i] ?? 0
    })) ?? [];

  return (
    <div className="bg-surface-panel border border-surface-border rounded-xl p-5">
      <h2 className="text-sm font-semibold text-content mb-4">
        Tren Deteksi ({days} Hari Terakhir)
      </h2>

      {loading ? (
        <Skeleton className="w-full rounded-lg" height="200px" />
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "var(--content-muted)" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--content-muted)" }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--surface-panel)",
                borderColor: "var(--surface-border)",
                borderRadius: "8px",
                fontSize: "12px",
                color: "var(--content)"
              }}
              labelStyle={{ color: "var(--content-secondary)" }}
            />
            <Line
              type="monotone"
              dataKey="count"
              stroke="var(--primary)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: "var(--primary)" }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
