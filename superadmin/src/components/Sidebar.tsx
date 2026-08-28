import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  ShoppingCart,
  Package,
  BarChart2,
  Settings,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Building2,
  Zap,
  Wrench,
  HeartHandshake,
} from "lucide-react";
import clsx from "clsx";
import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { appPathname } from "../lib/app-path";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Customers", href: "/clients", icon: Users },
  { label: "Orders", href: "/orders", icon: ShoppingCart },
  { label: "Services", href: "/services", icon: Package },
  { label: "Help moments", href: "/help-moments", icon: HeartHandshake },
  { label: "Pro", href: "/pro", icon: Wrench },
  { label: "Analytics", href: "/analytics", icon: BarChart2 },
  { label: "Serviceable City", href: "/city-services", icon: Building2 },
  { label: "Settings", href: "/settings", icon: Settings },
];

export default function Sidebar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <aside
      className={clsx(
        "flex flex-col bg-white text-charcoal border-r border-lightstone transition-all duration-300 shrink-0",
        collapsed ? "w-[68px]" : "w-60"
      )}
    >
      {/* Logo */}
      <div className={clsx(
        "flex items-center border-b border-lightstone h-16 shrink-0",
        collapsed ? "justify-center px-3" : "justify-between px-5"
      )}>
        {!collapsed && (
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-terracotta flex items-center justify-center shadow-sm">
              <Zap size={14} className="text-white" />
            </div>
            <span className="font-heading text-lg font-bold text-terracotta lowercase tracking-tight">
              kynd
            </span>
          </div>
        )}
        {collapsed && (
          <div className="w-7 h-7 rounded-lg bg-terracotta flex items-center justify-center shadow-sm">
            <Zap size={14} className="text-white" />
          </div>
        )}
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="p-1.5 rounded-lg text-warmgrey hover:text-terracotta hover:bg-accent-50 transition"
          >
            <PanelLeftClose size={17} />
          </button>
        )}
      </div>

      {/* Expand button when collapsed */}
      {collapsed && (
        <div className="flex justify-center pt-3 pb-1">
          <button
            onClick={() => setCollapsed(false)}
            className="p-1.5 rounded-lg text-warmgrey hover:text-terracotta hover:bg-accent-50 transition"
          >
            <PanelLeftOpen size={17} />
          </button>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 py-3 space-y-0.5 px-2.5 overflow-y-auto">
        {!collapsed && (
          <p className="text-[10px] uppercase tracking-widest text-warmgrey font-semibold px-2 pb-2 pt-1">Menu</p>
        )}
        {navItems.map(({ label, href, icon: Icon }) => {
          const active = appPathname(pathname).startsWith(href);
          return (
            <Link
              key={href}
              to={href}
              className={clsx(
                "flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-150",
                active
                  ? "bg-terracotta text-white shadow-soft"
                  : "text-warmgrey hover:bg-accent-50 hover:text-terracotta",
                collapsed && "justify-center"
              )}
              title={collapsed ? label : undefined}
            >
              <Icon size={17} className="shrink-0" />
              {!collapsed && <span className="leading-none">{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className={clsx("px-2.5 py-4 border-t border-lightstone", collapsed && "flex justify-center")}>
        <button
          onClick={handleLogout}
          className={clsx(
            "flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-sm font-medium text-warmgrey hover:bg-accent-50 hover:text-terracotta transition-all duration-150",
            collapsed ? "justify-center" : "w-full"
          )}
          title={collapsed ? "Logout" : undefined}
        >
          <LogOut size={17} className="shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}
