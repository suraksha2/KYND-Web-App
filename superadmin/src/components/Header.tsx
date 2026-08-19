import { Bell, Search, ChevronDown } from "lucide-react";
import { useLocation } from "react-router-dom";

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/clients": "Customers",
  "/orders": "Orders",
  "/services": "Services",
  "/analytics": "Analytics",
  "/city-services": "Serviceable City",
  "/settings": "Settings",
};

const pageSubs: Record<string, string> = {
  "/dashboard": "Welcome back, here's what's happening today.",
  "/clients": "Manage your customers.",
  "/orders": "View and manage orders.",
  "/services": "Manage available services.",
  "/analytics": "Track your performance.",
  "/city-services": "Manage serviceable cities.",
  "/settings": "Configure your preferences.",
};

export default function Header() {
  const { pathname } = useLocation();
  const title =
    Object.entries(pageTitles).find(([key]) => pathname.startsWith(key))?.[1] ?? "Admin Panel";
  const sub =
    Object.entries(pageSubs).find(([key]) => pathname.startsWith(key))?.[1] ?? "";

  return (
    <header className="h-16 bg-warmlinen border-b border-lightstone flex items-center justify-between px-6 shrink-0">
      <div>
        <h1 className="text-[15px] font-semibold text-charcoal leading-tight">{title}</h1>
        {sub && <p className="text-xs text-warmgrey leading-tight mt-0.5">{sub}</p>}
      </div>
      <div className="flex items-center gap-2">
        {/* Search */}
        <div className="relative hidden sm:block mr-2">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-warmgrey" />
          <input
            type="text"
            placeholder="Search anything..."
            className="pl-8 pr-4 py-2 text-sm bg-white border border-lightstone rounded-xl focus:outline-none focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta w-56 placeholder:text-warmgrey transition"
          />
        </div>

        {/* Notification bell */}
        <button className="relative p-2 rounded-xl hover:bg-white transition group">
          <Bell size={17} className="text-warmgrey group-hover:text-terracotta transition" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-red-500 rounded-full ring-2 ring-warmlinen" />
        </button>

        {/* Divider */}
        <div className="w-px h-6 bg-lightstone mx-1" />

        {/* Avatar */}
        <button className="flex items-center gap-2.5 hover:bg-white rounded-xl px-2.5 py-1.5 transition group">
          <div className="w-7 h-7 rounded-lg bg-terracotta flex items-center justify-center shadow-sm">
            <span className="text-white text-xs font-bold">A</span>
          </div>
          <span className="text-sm font-medium text-charcoal hidden sm:block">Admin</span>
          <ChevronDown size={13} className="text-warmgrey hidden sm:block" />
        </button>
      </div>
    </header>
  );
}
