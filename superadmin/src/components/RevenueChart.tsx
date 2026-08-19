import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export default function RevenueChart() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRevenueData();
  }, []);

  async function fetchRevenueData() {
    try {
      const res = await apiFetch("/api/analytics");
      const json = await res.json();
      if (json.data) {
        setData(json.data);
      }
    } catch (err) {
      console.error("Failed to fetch revenue data", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-sm font-semibold text-charcoal">Revenue Overview</h2>
          <p className="text-xs text-warmgrey mt-0.5">Monthly revenue trend</p>
        </div>
        <div className="flex items-center gap-1 bg-white rounded-lg p-1 border border-lightstone">
          {["6M", "12M", "All"].map((p) => (
            <button key={p} className="text-xs px-2.5 py-1 rounded-md font-medium text-warmgrey hover:bg-accent-50 hover:text-charcoal hover:shadow-sm transition first:bg-accent-50 first:text-charcoal first:shadow-sm">
              {p}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex gap-1.5">
            {[0,1,2].map(i => (
              <div key={i} className="w-1.5 h-1.5 rounded-full bg-terracotta animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#A95F45" stopOpacity={0.18} />
                  <stop offset="95%" stopColor="#A95F45" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F5F1EA" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: "#70685E" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#70685E" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                formatter={(value: number) => [`$${value.toLocaleString()}`, "Revenue"]}
                contentStyle={{
                  borderRadius: "10px",
                  border: "1px solid #D6CEC2",
                  fontSize: "12px",
                  boxShadow: "0 4px 6px -1px rgba(43,41,38,0.07)",
                  padding: "8px 12px",
                }}
                cursor={{ stroke: "#A95F45", strokeWidth: 1, strokeDasharray: "4 2" }}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#A95F45"
                strokeWidth={2}
                fill="url(#revenueGrad)"
                dot={false}
                activeDot={{ r: 4, fill: "#A95F45", stroke: "#fff", strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
