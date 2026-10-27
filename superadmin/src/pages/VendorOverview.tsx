import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AreaChart, Area,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  DollarSign, Wallet, TrendingUp, CheckCircle2, Star, Timer,
  CalendarDays, Loader2, Trophy,
} from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";

type VendorRow = {
  id: number;
  name: string;
  city: string | null;
  status: string;
  jobs: number;
  visits: number;
  workload: number;
  pending: number;
  active: number;
  completed: number;
  cancelled: number;
  completionRate: number | null;
  revenue: number;
  vendorCost: number;
  ownRevenue: number;
  expenses: number;
  avgRating: number | null;
  reviews: number;
  avgCompletionHours: number | null;
  score: number;
};

type DashboardData = {
  range: { from: string; to: string };
  kpi: {
    revenue: number;
    vendorCost: number;
    platformFees: number;
    overheads: number;
    netMargin: number;
    marginPct: number;
    ownRevenue: number;
    jobs: number;
    visits: number;
    workload: number;
    pending: number;
    active: number;
    completed: number;
    cancelled: number;
    avgRating: number | null;
    reviews: number;
    avgCompletionHours: number | null;
    payoutsPending: number;
    payoutsPendingTotal: number;
    payoutsScheduledTotal: number;
    payoutsPaidInRange: number;
  };
  offers: { open: number; accepted: number; declined: number; expired: number; taken: number };
  byCategory: { category: string; jobs: number; avgHours: number }[];
  trend: { date: string; completed: number; revenue: number }[];
  vendors: VendorRow[];
};

const tooltipStyle = {
  borderRadius: "12px",
  border: "1px solid #D6CEC2",
  boxShadow: "0 4px 16px rgba(43,41,38,0.08)",
  fontSize: "12px",
  padding: "8px 12px",
};

function money(n: number | null | undefined, decimals = 0): string {
  return `S$${Number(n || 0).toLocaleString("en-SG", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

function hoursLabel(h: number | null): string {
  if (h === null) return "—";
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 48) return `${h}h`;
  return `${Math.round((h / 24) * 10) / 10}d`;
}

// SGT wall-clock helpers — the API compares DATE(...) against DATETIME columns
// stored as Singapore time, so presets must resolve to SGT calendar dates
// regardless of the browser's own timezone.
function sgtToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
}
function shiftDay(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
function weekStart(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dow = (new Date(y, m - 1, d).getDay() + 6) % 7; // Monday = 0
  return shiftDay(ymd, -dow);
}
function monthStart(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`;
}
function fmtDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-SG", { day: "numeric", month: "short" });
}

type Preset = "today" | "week" | "month" | "custom";

const PRESETS: { key: Exclude<Preset, "custom">; label: string }[] = [
  { key: "today", label: "Daily" },
  { key: "week", label: "Weekly" },
  { key: "month", label: "Monthly" },
];

function presetRange(preset: Exclude<Preset, "custom">): { from: string; to: string } {
  const today = sgtToday();
  if (preset === "today") return { from: today, to: today };
  if (preset === "week") return { from: weekStart(today), to: today };
  return { from: monthStart(today), to: today };
}

const JOB_STATUS_SEGMENTS: { key: "completed" | "active" | "pending" | "cancelled"; label: string; color: string }[] = [
  { key: "completed", label: "Completed", color: "#7A8D72" },
  { key: "active", label: "In progress", color: "#A95F45" },
  { key: "pending", label: "Pending", color: "#C9A84C" },
  { key: "cancelled", label: "Cancelled", color: "#C58A8A" },
];

export default function VendorOverview() {
  const [preset, setPreset] = useState<Preset>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [range, setRange] = useState(() => presetRange("month"));
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [chartTab, setChartTab] = useState<"revenue" | "completed">("revenue");

  const load = useCallback(async (from: string, to: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch(`/api/vendors/dashboard?from=${from}&to=${to}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load the vendor dashboard.");
      setData(json);
    } catch (err) {
      setData(null);
      setError(err instanceof Error ? err.message : "Failed to load the vendor dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(range.from, range.to); }, [range, load]);

  function applyPreset(p: Exclude<Preset, "custom">) {
    setPreset(p);
    setRange(presetRange(p));
  }

  function applyCustom() {
    if (!customFrom || !customTo) return;
    setPreset("custom");
    setRange(customFrom <= customTo ? { from: customFrom, to: customTo } : { from: customTo, to: customFrom });
  }

  const kpi = data?.kpi;
  const vendors = useMemo(() => data?.vendors ?? [], [data]);
  const topVendors = useMemo(() => vendors.filter((v) => v.workload > 0).slice(0, 5), [vendors]);
  const categories = data?.byCategory ?? [];
  const trend = useMemo(
    () => (data?.trend ?? []).map((t) => ({ ...t, day: fmtDay(t.date) })),
    [data]
  );

  const jobDonut = JOB_STATUS_SEGMENTS.map((s) => ({
    name: s.label,
    value: Number(kpi?.[s.key] ?? 0),
    color: s.color,
  }));
  const workloadTotal = jobDonut.reduce((s, d) => s + d.value, 0);
  const offersTotal = data ? data.offers.accepted + data.offers.declined + data.offers.expired + data.offers.taken : 0;
  const acceptRate = offersTotal > 0 && data ? Math.round((data.offers.accepted / offersTotal) * 100) : null;
  const maxCategoryJobs = categories[0]?.jobs || 1;
  const inputCls = "px-2.5 py-1.5 text-sm border border-lightstone rounded-lg focus:outline-none focus:ring-2 focus:ring-terracotta/30";

  return (
    <div className="space-y-5">
      {/* Date filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-1 rounded-xl bg-warmlinen p-1">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => applyPreset(p.key)}
              className={clsx(
                "px-3.5 py-1.5 rounded-lg text-sm font-semibold transition",
                preset === p.key ? "bg-white text-charcoal shadow-sm" : "text-warmgrey hover:text-charcoal"
              )}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => setPreset("custom")}
            className={clsx(
              "px-3.5 py-1.5 rounded-lg text-sm font-semibold transition",
              preset === "custom" ? "bg-white text-charcoal shadow-sm" : "text-warmgrey hover:text-charcoal"
            )}
          >
            Custom
          </button>
        </div>
        {preset === "custom" && (
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className={inputCls} />
            <span className="text-xs text-warmgrey">to</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className={inputCls} />
            <button
              onClick={applyCustom}
              disabled={!customFrom || !customTo}
              className="px-3.5 py-1.5 text-sm font-semibold text-white bg-terracotta hover:bg-accent-700 rounded-lg transition disabled:opacity-50"
            >
              Apply
            </button>
          </div>
        )}
        {data && (
          <p className="inline-flex items-center gap-1.5 text-xs text-warmgrey ml-auto">
            <CalendarDays size={13} />
            {fmtDay(data.range.from)} – {fmtDay(data.range.to)}
          </p>
        )}
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-terracotta" />
        </div>
      ) : error ? (
        <div className="bg-white rounded-2xl border border-lightstone shadow-sm text-center py-16 px-4">
          <p role="alert" className="text-sm text-rosewood">{error}</p>
          <button onClick={() => load(range.from, range.to)} className="mt-2 text-sm text-terracotta font-medium hover:underline">
            Retry
          </button>
        </div>
      ) : data && kpi ? (
        <div className={clsx("space-y-5", loading && "opacity-60 pointer-events-none transition")}>
          {/* KPI cards */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              { label: "Revenue", value: money(kpi.revenue), icon: DollarSign, color: "bg-terracotta", sub: "customer value of completed Kynd work" },
              { label: "Vendor cost", value: money(kpi.vendorCost), icon: Wallet, color: "bg-sage", sub: "owed to partners for that work" },
              { label: "Net margin", value: money(kpi.netMargin), icon: TrendingUp, color: kpi.netMargin >= 0 ? "bg-terracotta" : "bg-dustyrose", sub: `${kpi.marginPct}% of revenue, after overheads` },
              { label: "Completed work", value: String(kpi.completed), icon: CheckCircle2, color: "bg-sage", sub: `${kpi.workload} jobs + visits scheduled` },
            ].map(({ label, value, icon: Icon, color, sub }) => (
              <div key={label} className="bg-white rounded-2xl border border-lightstone shadow-sm p-5">
                <div className={clsx("w-10 h-10 rounded-xl flex items-center justify-center mb-3", color)}>
                  <Icon size={18} className="text-white" />
                </div>
                <p className="text-xl font-bold text-charcoal">{value}</p>
                <p className="text-sm text-warmgrey mt-0.5">{label}</p>
                <p className="text-[11px] text-warmgrey mt-1">{sub}</p>
              </div>
            ))}
          </div>

          {/* P&L + job performance */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-2 bg-white rounded-2xl border border-lightstone shadow-sm p-5">
              <div className="mb-4">
                <h2 className="text-sm font-bold text-charcoal">Profit &amp; loss</h2>
                <p className="text-xs text-warmgrey mt-0.5">Kynd-booked work completed in the selected period</p>
              </div>
              <dl className="space-y-2.5 text-sm">
                {[
                  { label: "Revenue", value: kpi.revenue, strong: true },
                  { label: "Partner / vendor costs", value: -kpi.vendorCost },
                  { label: "Platform fees & margin", value: kpi.platformFees, strong: true },
                  { label: "Overheads (vendor-reported expenses)", value: -kpi.overheads },
                ].map((row) => (
                  <div key={row.label} className={clsx(
                    "flex items-center justify-between gap-4",
                    row.strong && "border-t border-lightstone pt-2.5"
                  )}>
                    <dt className={row.strong ? "font-semibold text-charcoal" : "text-warmgrey"}>{row.label}</dt>
                    <dd className={clsx("font-semibold whitespace-nowrap", row.value < 0 ? "text-rosewood" : "text-charcoal")}>
                      {row.value < 0 ? `−${money(-row.value, 2)}` : money(row.value, 2)}
                    </dd>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-4 border-t border-lightstone pt-3">
                  <dt className="font-bold text-charcoal">Net margin</dt>
                  <dd className={clsx("font-bold whitespace-nowrap", kpi.netMargin >= 0 ? "text-sage" : "text-rosewood")}>
                    {money(kpi.netMargin, 2)} <span className="text-xs font-semibold text-warmgrey">({kpi.marginPct}%)</span>
                  </dd>
                </div>
              </dl>
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl bg-warmlinen/60 px-3 py-2.5">
                  <p className="text-warmgrey">Vendor own-booking value</p>
                  <p className="mt-0.5 font-bold text-charcoal">{money(kpi.ownRevenue, 2)}</p>
                  <p className="text-[11px] text-warmgrey mt-0.5">Invoiced by vendors directly — not platform revenue</p>
                </div>
                <div className="rounded-xl bg-warmlinen/60 px-3 py-2.5">
                  <p className="text-warmgrey">Payouts in period</p>
                  <p className="mt-0.5 font-bold text-charcoal">{money(kpi.payoutsPaidInRange, 2)}</p>
                  <p className="text-[11px] text-warmgrey mt-0.5">
                    {money(kpi.payoutsPendingTotal + kpi.payoutsScheduledTotal, 2)} still owed or accruing
                  </p>
                </div>
              </div>
            </div>

            {/* Job performance */}
            <div className="bg-white rounded-2xl border border-lightstone shadow-sm p-5">
              <div className="mb-3">
                <h2 className="text-sm font-bold text-charcoal">Job performance</h2>
                <p className="text-xs text-warmgrey mt-0.5">Jobs & marketplace visits scheduled in range</p>
              </div>
              {workloadTotal === 0 ? (
                <div className="flex items-center justify-center h-40 text-sm text-warmgrey">No work in this period</div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={170}>
                    <PieChart>
                      <Pie data={jobDonut} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
                        {jobDonut.map((d) => <Cell key={d.name} fill={d.color} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle}
                        formatter={(v: number, _: string, props: any) => [
                          `${v} (${workloadTotal > 0 ? Math.round((v / workloadTotal) * 100) : 0}%)`,
                          props.payload.name,
                        ]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5 mt-2">
                    {jobDonut.map((d) => (
                      <div key={d.name} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: d.color }} />
                          <span className="text-warmgrey">{d.name}</span>
                        </div>
                        <span className="font-semibold text-charcoal">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <div className="mt-4 border-t border-lightstone pt-3 text-xs text-warmgrey space-y-1.5">
                <div className="flex justify-between">
                  <span>Offers sent</span>
                  <span className="font-semibold text-charcoal">{offersTotal + (data.offers.open || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Accept rate</span>
                  <span className="font-semibold text-charcoal">{acceptRate === null ? "—" : `${acceptRate}%`}</span>
                </div>
                <div className="flex justify-between">
                  <span>Avg. completion time</span>
                  <span className="font-semibold text-charcoal">{hoursLabel(kpi.avgCompletionHours)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Avg. rating</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-charcoal">
                    {kpi.avgRating === null ? "—" : <><Star size={11} className="text-terracotta" />{kpi.avgRating} ({kpi.reviews})</>}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Trend + top vendors */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-2 bg-white rounded-2xl border border-lightstone shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-bold text-charcoal">Completed work trend</h2>
                  <p className="text-xs text-warmgrey mt-0.5">Daily across the selected period</p>
                </div>
                <div className="flex bg-accent-50 rounded-xl p-0.5 gap-0.5">
                  {(["revenue", "completed"] as const).map((t) => (
                    <button key={t} onClick={() => setChartTab(t)}
                      className={clsx("px-3 py-1.5 text-xs font-semibold rounded-lg transition capitalize",
                        chartTab === t ? "bg-white text-terracotta shadow-sm" : "text-warmgrey hover:text-terracotta")}>
                      {t === "completed" ? "Jobs" : t}
                    </button>
                  ))}
                </div>
              </div>
              {trend.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-sm text-warmgrey">No completions in this period</div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={trend} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="vendorGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#A95F45" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#A95F45" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F5F1EA" />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#70685E" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#70685E" }} axisLine={false} tickLine={false}
                      tickFormatter={(v) => chartTab === "revenue" ? `S$${(v / 1000).toFixed(0)}k` : String(v)} />
                    <Tooltip contentStyle={tooltipStyle}
                      formatter={(v: number) => chartTab === "revenue"
                        ? [money(v), "Revenue"]
                        : [v, "Completed work"]} />
                    <Area type="monotone" dataKey={chartTab} stroke="#A95F45" strokeWidth={2.5}
                      fill="url(#vendorGrad)" dot={false} activeDot={{ r: 5, fill: "#A95F45" }} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Top vendors */}
            <div className="bg-white rounded-2xl border border-lightstone shadow-sm p-5">
              <div className="mb-4">
                <h2 className="text-sm font-bold text-charcoal">Top-performing vendors</h2>
                <p className="text-xs text-warmgrey mt-0.5">Ranked on completions, revenue, rating &amp; reliability</p>
              </div>
              {topVendors.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-sm text-warmgrey">
                  <Trophy size={24} className="text-lightstone mb-2" />
                  No vendor work in this period
                </div>
              ) : (
                <div className="space-y-3">
                  {topVendors.map((v, i) => (
                    <Link key={v.id} to={`/vendors/${v.id}`} className="block group">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={clsx(
                            "w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0",
                            i === 0 ? "bg-terracotta text-white" : "bg-accent-50 text-terracotta"
                          )}>
                            {i + 1}
                          </span>
                          <span className="font-semibold text-charcoal truncate group-hover:text-terracotta transition">{v.name}</span>
                        </div>
                        <span className="text-warmgrey shrink-0">{v.score} pts</span>
                      </div>
                      <div className="flex items-center gap-3 pl-7 text-[11px] text-warmgrey">
                        <span>{v.completed} done</span>
                        <span>{money(v.revenue)}</span>
                        <span className="inline-flex items-center gap-0.5">
                          <Star size={9} className="text-terracotta" />{v.avgRating ?? "—"}
                        </span>
                      </div>
                      <div className="h-1.5 bg-accent-50 rounded-full overflow-hidden mt-1.5 ml-7">
                        <div className="h-full rounded-full bg-terracotta transition-all duration-500"
                          style={{ width: `${Math.min(100, v.score)}%` }} />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Completion time by category */}
          <div className="bg-white rounded-2xl border border-lightstone shadow-sm p-5">
            <div className="mb-4">
              <h2 className="text-sm font-bold text-charcoal">Service completion time</h2>
              <p className="text-xs text-warmgrey mt-0.5">Average on-site duration by service category (started → completed)</p>
            </div>
            {categories.length === 0 ? (
              <p className="text-sm text-warmgrey text-center py-8">No timed completions in this period — durations appear once workers log start and completion.</p>
            ) : (
              <div className="space-y-3">
                {categories.map((c) => {
                  const pct = Math.round((c.jobs / maxCategoryJobs) * 100);
                  return (
                    <div key={c.category}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-md bg-accent-50 flex items-center justify-center">
                            <Timer size={10} className="text-terracotta" />
                          </div>
                          <span className="text-warmgrey font-medium">{c.category}</span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-warmgrey">{c.jobs} completed</span>
                          <span className="text-charcoal font-semibold">{hoursLabel(c.avgHours)} avg</span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-accent-50 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-sage transition-all duration-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Vendor comparison */}
          <div className="bg-white rounded-2xl border border-lightstone shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-lightstone">
              <h2 className="text-sm font-bold text-charcoal">Vendor comparison</h2>
              <p className="text-xs text-warmgrey mt-0.5">Operational and financial KPIs for every vendor in the period</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-lightstone">
                    {["Vendor", "Work", "Done", "Rate", "Avg time", "Revenue", "Vendor cost", "Overheads", "Rating", "Score"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-warmgrey uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-lightstone/50">
                  {vendors.map((v) => (
                    <tr key={v.id} className="hover:bg-accent-50/70 transition">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Link to={`/vendors/${v.id}`} className="font-semibold text-terracotta hover:underline">{v.name}</Link>
                        <p className="text-[11px] text-warmgrey mt-0.5 capitalize">{v.status}{v.city ? ` · ${v.city}` : ""}</p>
                      </td>
                      <td className="px-4 py-3 text-warmgrey whitespace-nowrap">{v.workload}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 text-sage font-medium">
                          <CheckCircle2 size={12} />{v.completed}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {v.completionRate === null ? <span className="text-warmgrey">—</span> : (
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-accent-50 rounded-full overflow-hidden">
                              <div className="h-full bg-sage rounded-full" style={{ width: `${v.completionRate}%` }} />
                            </div>
                            <span className="text-xs text-warmgrey">{v.completionRate}%</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-warmgrey whitespace-nowrap">{hoursLabel(v.avgCompletionHours)}</td>
                      <td className="px-4 py-3 font-semibold text-charcoal whitespace-nowrap">{money(v.revenue)}</td>
                      <td className="px-4 py-3 text-warmgrey whitespace-nowrap">{money(v.vendorCost)}</td>
                      <td className="px-4 py-3 text-warmgrey whitespace-nowrap">{v.expenses > 0 ? money(v.expenses) : "—"}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {v.avgRating === null ? <span className="text-warmgrey">—</span> : (
                          <span className="inline-flex items-center gap-1 text-charcoal font-medium">
                            <Star size={11} className="text-terracotta" />{v.avgRating}
                            <span className="text-warmgrey font-normal">({v.reviews})</span>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={clsx(
                          "inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-semibold",
                          v.workload === 0 ? "bg-lightstone/60 text-warmgrey" :
                            v.score >= 60 ? "bg-sage/10 text-sage" :
                            v.score >= 30 ? "bg-accent-100 text-terracotta" : "bg-lightstone/60 text-warmgrey"
                        )}>
                          {v.workload === 0 ? "No work" : `${v.score}`}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {vendors.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-4 py-10 text-center text-sm text-warmgrey">No vendors yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
