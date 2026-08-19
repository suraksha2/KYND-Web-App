import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import StatCard from "@/components/StatCard";
import RevenueChart from "@/components/RevenueChart";
import RecentOrders from "@/components/RecentOrders";
import TopServices from "@/components/TopServices";
import {
  Users, ShoppingCart, DollarSign, TrendingUp,
  Clock, CheckCircle, AlertCircle, RefreshCw,
} from "lucide-react";

export default function DashboardPage() {
  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalClients: 0,
    totalOrders: 0,
    growthRate: 0,
    todayOrders: 0,
    reprocessingToday: 0,
    processingToday: 0,
    pendingToday: 0,
    completedTotal: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchStats();
  }, []);

  async function fetchStats(silent = false) {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await apiFetch("/api/dashboard/stats");
      const json = await res.json();
      if (json.data) setStats(json.data);
    } catch (err) {
      console.error("Failed to fetch dashboard stats", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const mainStats = [
    {
      title: "Total Revenue",
      value: `S$${stats.totalRevenue.toLocaleString()}`,
      change: "12.5%",
      positive: true,
      icon: DollarSign,
      color: "bg-terracotta",
      href: "/analytics",
    },
    {
      title: "Total Clients",
      value: stats.totalClients.toLocaleString(),
      change: "8.2%",
      positive: true,
      icon: Users,
      color: "bg-sage",
      href: "/clients",
    },
    {
      title: "Total Orders",
      value: stats.totalOrders.toLocaleString(),
      change: "3.1%",
      positive: false,
      icon: ShoppingCart,
      color: "bg-terracotta",
      href: "/orders",
    },
    {
      title: "Growth Rate",
      value: `${stats.growthRate.toFixed(1)}%`,
      change: `${Math.abs(stats.growthRate).toFixed(1)}%`,
      positive: stats.growthRate >= 0,
      icon: TrendingUp,
      color: "bg-sage",
      href: "/analytics",
    },
  ];

  const todayCards = [
    { title: "Today's Bookings", value: stats.todayOrders.toString(),     icon: ShoppingCart, color: "bg-terracotta",  href: "/orders" },
    { title: "Upcoming",         value: stats.processingToday.toString(), icon: Clock,        color: "bg-sage",        href: "/orders" },
    { title: "Cancelled Today",  value: stats.pendingToday.toString(),    icon: AlertCircle,  color: "bg-dustyrose",   href: "/orders" },
    { title: "All Completed",    value: stats.completedTotal.toString(),  icon: CheckCircle,  color: "bg-sage",        href: "/orders" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="flex gap-1.5">
            {[0,1,2].map(i => (
              <div key={i} className="w-2 h-2 rounded-full bg-terracotta animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
          <p className="text-sm text-warmgrey">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6">

      {/* Page title row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-charcoal">Overview</h2>
          <p className="text-sm text-warmgrey mt-0.5">
            {new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <button
          onClick={() => fetchStats(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-warmgrey hover:text-charcoal bg-white border border-lightstone hover:border-terracotta px-3 py-2 rounded-xl transition shadow-soft disabled:opacity-50"
        >
          <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Main KPI cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {mainStats.map((stat) => (
          <StatCard key={stat.title} {...stat} />
        ))}
      </div>

      {/* Today's snapshot */}
      <div>
        <p className="text-xs font-semibold text-warmgrey uppercase tracking-widest mb-3">Today's Activity</p>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {todayCards.map((stat) => (
            <StatCard key={stat.title} {...stat} change="" positive={true} />
          ))}
        </div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 bg-white rounded-2xl border border-lightstone shadow-soft p-5">
          <RevenueChart />
        </div>
        <div className="bg-white rounded-2xl border border-lightstone shadow-soft p-5">
          <TopServices />
        </div>
      </div>

      {/* Recent Orders */}
      <div className="bg-white rounded-2xl border border-lightstone shadow-soft p-5">
        <RecentOrders />
      </div>

    </div>
  );
}
