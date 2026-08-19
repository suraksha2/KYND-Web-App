import { useState, useEffect } from "react";
import {
  AreaChart, Area,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  ShoppingCart, DollarSign, Users, TrendingUp, TrendingDown,
  CheckCircle, XCircle, Clock, MapPin, Star,
} from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";

const BAR_COLORS = ["#A95F45", "#A95F45", "#A95F45", "#A95F45", "#A95F45", "#A95F45"];

function GrowthBadge({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <span className={clsx(
      "inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-lg",
      positive ? "bg-sage/10 text-sage" : "bg-dustyrose/10 text-rosewood"
    )}>
      {positive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {positive ? "+" : ""}{value}%
    </span>
  );
}

const tooltipStyle = {
  borderRadius: "12px",
  border: "1px solid #D6CEC2",
  boxShadow: "0 4px 16px rgba(43,41,38,0.08)",
  fontSize: "12px",
  padding: "8px 12px",
};

export default function AnalyticsPage() {
  const [data, setData]     = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [chartTab, setChartTab] = useState<"revenue" | "orders">("revenue");

  useEffect(() => { fetchAnalytics(); }, []);

  async function fetchAnalytics() {
    try {
      const res  = await apiFetch("/api/analytics");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Failed to fetch analytics", err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="flex gap-1.5">
            {[0,1,2].map(i => (
              <div key={i} className="w-2 h-2 rounded-full bg-terracotta animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
          <p className="text-sm text-warmgrey">Loading analytics…</p>
        </div>
      </div>
    );
  }

  const kpi          = data?.kpi          ?? {};
  const monthly      = data?.monthly      ?? [];
  const statusBreak  = data?.statusBreakdown ?? [];
  const topServices  = data?.topServices  ?? [];
  const topCities    = data?.topCities    ?? [];

  // Status donut data
  const statusLabels: Record<string, { label: string; color: string }> = {
    completed: { label: "Completed", color: "#7A8D72" },
    upcoming:  { label: "Upcoming",  color: "#A95F45" },
    cancelled: { label: "Cancelled", color: "#C58A8A" },
  };
  const donutData = statusBreak.map((r: any) => ({
    name:  (statusLabels[r.status]?.label ?? r.status),
    value: Number(r.count),
    color: statusLabels[r.status]?.color ?? "#70685E",
  }));
  const totalBookings = donutData.reduce((s: number, d: any) => s + d.value, 0);

  // Top services — normalise to max for bar width
  const maxSvcCount = topServices[0]?.count || 1;

  // Top cities — normalise
  const maxCityBookings = topCities[0]?.bookings || 1;

  return (
    <div className="space-y-5 pb-6">

      {/* KPI Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          {
            label: "Total Revenue",
            value: `S$${Number(kpi.totalRevenue ?? 0).toLocaleString("en-SG")}`,
            icon: DollarSign, color: "bg-terracotta",
            badge: <GrowthBadge value={kpi.revenueGrowth ?? 0} />,
            sub: "vs last month",
          },
          {
            label: "Total Bookings",
            value: Number(kpi.totalOrders ?? 0).toLocaleString(),
            icon: ShoppingCart, color: "bg-sage",
            badge: <GrowthBadge value={kpi.ordersGrowth ?? 0} />,
            sub: "vs last month",
          },
          {
            label: "Unique Customers",
            value: Number(kpi.uniqueCustomers ?? 0).toLocaleString(),
            icon: Users, color: "bg-terracotta",
            badge: null,
            sub: `${kpi.last30Days ?? 0} in last 30 days`,
          },
          {
            label: "Avg. Order Value",
            value: `S$${Number(kpi.avgOrderValue ?? 0).toLocaleString("en-SG")}`,
            icon: Star, color: "bg-terracotta",
            badge: null,
            sub: "from completed bookings",
          },
        ].map(({ label, value, icon: Icon, color, badge, sub }) => (
          <div key={label} className="bg-white rounded-2xl border border-lightstone shadow-sm p-5">
            <div className="flex items-start justify-between mb-3">
              <div className={clsx("w-10 h-10 rounded-xl flex items-center justify-center", color)}>
                <Icon size={18} className="text-white" />
              </div>
              {badge}
            </div>
            <p className="text-xl font-bold text-charcoal">{value}</p>
            <p className="text-sm text-warmgrey mt-0.5">{label}</p>
            <p className="text-[11px] text-warmgrey mt-1">{sub}</p>
          </div>
        ))}
      </div>

      {/* Quick stats strip */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Today",       value: kpi.todayOrders ?? 0, icon: Clock,         cls: "text-terracotta bg-accent-50" },
          { label: "Last 7 days", value: kpi.last7Days   ?? 0, icon: ShoppingCart,  cls: "text-sage bg-sage/10" },
          { label: "Last 30 days",value: kpi.last30Days  ?? 0, icon: TrendingUp,    cls: "text-terracotta bg-accent-50" },
        ].map(({ label, value, icon: Icon, cls }) => (
          <div key={label} className="bg-white rounded-2xl border border-lightstone shadow-sm p-4 flex items-center gap-4">
            <div className={clsx("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", cls)}>
              <Icon size={16} />
            </div>
            <div>
              <p className="text-lg font-bold text-charcoal">{value}</p>
              <p className="text-xs text-warmgrey">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Main chart + Status donut */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Revenue / Orders trend */}
        <div className="xl:col-span-2 bg-white rounded-2xl border border-lightstone shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-charcoal">Performance Trend</h2>
              <p className="text-xs text-warmgrey mt-0.5">Last 12 months</p>
            </div>
            <div className="flex bg-accent-50 rounded-xl p-0.5 gap-0.5">
              {(["revenue", "orders"] as const).map(t => (
                <button key={t} onClick={() => setChartTab(t)}
                  className={clsx("px-3 py-1.5 text-xs font-semibold rounded-lg transition capitalize",
                    chartTab === t ? "bg-white text-terracotta shadow-sm" : "text-warmgrey hover:text-terracotta")}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={monthly} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#A95F45" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#A95F45" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F5F1EA" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#70685E" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#70685E" }} axisLine={false} tickLine={false}
                tickFormatter={v => chartTab === "revenue" ? `S$${(v/1000).toFixed(0)}k` : String(v)} />
              <Tooltip contentStyle={tooltipStyle}
                formatter={(v: number) => chartTab === "revenue"
                  ? [`S$${Number(v).toLocaleString("en-SG")}`, "Revenue"]
                  : [v, "Bookings"]} />
              <Area type="monotone" dataKey={chartTab} stroke="#A95F45" strokeWidth={2.5}
                fill="url(#grad)" dot={false} activeDot={{ r: 5, fill: "#A95F45" }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Booking status donut */}
        <div className="bg-white rounded-2xl border border-lightstone shadow-sm p-5">
          <div className="mb-3">
            <h2 className="text-sm font-bold text-charcoal">Booking Status</h2>
            <p className="text-xs text-warmgrey mt-0.5">All time breakdown</p>
          </div>
          {donutData.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-sm text-warmgrey">No data</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={donutData} cx="50%" cy="50%" innerRadius={55} outerRadius={80}
                    paddingAngle={3} dataKey="value">
                    {donutData.map((d: any, i: number) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle}
                    formatter={(v: number, _: string, props: any) => [
                      `${v} (${totalBookings > 0 ? Math.round((v / totalBookings) * 100) : 0}%)`,
                      props.payload.name
                    ]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-2">
                {donutData.map((d: any) => (
                  <div key={d.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: d.color }} />
                      <span className="text-warmgrey">{d.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-charcoal">{d.value}</span>
                      <span className="text-warmgrey">
                        {totalBookings > 0 ? Math.round((d.value / totalBookings) * 100) : 0}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Top Services + Top Cities */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

        {/* Top Services bar list */}
        <div className="bg-white rounded-2xl border border-lightstone shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-charcoal">Top Services</h2>
              <p className="text-xs text-warmgrey mt-0.5">By number of bookings</p>
            </div>
          </div>
          {topServices.length === 0 ? (
            <p className="text-sm text-warmgrey text-center py-8">No service data</p>
          ) : (
            <div className="space-y-3">
              {topServices.map((s: any, i: number) => {
                const pct = Math.round((s.count / maxSvcCount) * 100);
                return (
                  <div key={s.name}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-md flex items-center justify-center text-white text-[10px] font-bold"
                          style={{ backgroundColor: BAR_COLORS[i % BAR_COLORS.length] }}>
                          {i + 1}
                        </span>
                        <span className="text-warmgrey font-medium truncate max-w-[160px]">{s.name}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-warmgrey">{s.count} bookings</span>
                        <span className="text-warmgrey font-semibold">S${Number(s.revenue).toLocaleString("en-SG")}</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-accent-50 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: BAR_COLORS[i % BAR_COLORS.length] }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Top Cities */}
        <div className="bg-white rounded-2xl border border-lightstone shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-charcoal">Top Cities</h2>
              <p className="text-xs text-warmgrey mt-0.5">By booking volume</p>
            </div>
          </div>
          {topCities.length === 0 ? (
            <p className="text-sm text-warmgrey text-center py-8">No city data</p>
          ) : (
            <div className="space-y-3">
              {topCities.map((c: any, i: number) => {
                const pct = Math.round((Number(c.bookings) / maxCityBookings) * 100);
                return (
                  <div key={c.city}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-md bg-accent-50 flex items-center justify-center">
                          <MapPin size={10} className="text-terracotta" />
                        </div>
                        <span className="text-warmgrey font-medium">{c.city}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-warmgrey">{c.bookings} bookings</span>
                        <span className="text-warmgrey font-semibold">S${Number(c.revenue).toLocaleString("en-SG")}</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-accent-50 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-terracotta transition-all duration-500"
                        style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Monthly breakdown table */}
      <div className="bg-white rounded-2xl border border-lightstone shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-lightstone">
          <div>
            <h2 className="text-sm font-bold text-charcoal">Monthly Breakdown</h2>
            <p className="text-xs text-warmgrey mt-0.5">Revenue, orders and completion rate by month</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-lightstone">
                {["Month", "Bookings", "Completed", "Cancelled", "Revenue", "Completion Rate"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-warmgrey uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-lightstone/50">
              {monthly.map((row: any) => {
                const total     = Number(row.orders    ?? 0);
                const completed = Number(row.completed ?? 0);
                const cancelled = Number(row.cancelled ?? 0);
                const rate      = total > 0 ? Math.round((completed / total) * 100) : 0;
                return (
                  <tr key={`${row.yr}-${row.monthNum}`} className="hover:bg-accent-50/60 transition">
                    <td className="px-4 py-3 font-semibold text-charcoal whitespace-nowrap">{row.month} {row.yr ?? ""}</td>
                    <td className="px-4 py-3 text-warmgrey whitespace-nowrap">{total}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 text-sage font-medium">
                        <CheckCircle size={12} />{completed}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 text-rosewood font-medium">
                        <XCircle size={12} />{cancelled}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-charcoal whitespace-nowrap">
                      S${Number(row.revenue ?? 0).toLocaleString("en-SG")}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-accent-50 rounded-full overflow-hidden">
                          <div className="h-full bg-sage rounded-full" style={{ width: `${rate}%` }} />
                        </div>
                        <span className="text-xs text-warmgrey">{rate}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {monthly.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-warmgrey">No monthly data available.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
