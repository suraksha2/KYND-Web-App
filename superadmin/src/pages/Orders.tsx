import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Search, Eye, X, CheckCircle, XCircle, CalendarClock,
  ShoppingCart, DollarSign, Clock, Ban, AlertTriangle,
  MapPin, Phone, Package, User, CreditCard, Calendar,
} from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { parseSgt } from "@/lib/sgt";
import BookingAssignment from "@/components/BookingAssignment";

const statusCfg: Record<string, { cls: string; dot: string; label: string }> = {
  Upcoming:  { cls: "bg-accent-50 text-terracotta ring-1 ring-terracotta/20",        dot: "bg-terracotta",    label: "Upcoming"  },
  Completed: { cls: "bg-sage/10 text-sage ring-1 ring-sage/20",dot: "bg-sage", label: "Completed" },
  Cancelled: { cls: "bg-dustyrose/10 text-rosewood ring-1 ring-dustyrose/20",           dot: "bg-dustyrose",     label: "Cancelled" },
};

const avatarColors = [
  "bg-terracotta","bg-sage","bg-terracotta","bg-dustyrose","bg-terracotta","bg-terracotta",
];

function getInitials(name: string) {
  return (name || "?").trim().split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

const TABS = [
  { label: "All",       filter: null },
  { label: "Upcoming",  filter: "Upcoming" },
  { label: "Completed", filter: "Completed" },
  { label: "Cancelled", filter: "Cancelled" },
];

// A slot this far past due counts as missed — same grace the dispatch cron
// uses before sending the admin WhatsApp alert.
const MISSED_GRACE_MS = 60 * 60 * 1000;

// When the provider was expected to act: the earliest still-open visit of a
// recurring plan, else the booked slot (or placed time for ASAP jobs).
function dueAtOf(order: any): Date | null {
  if (order.schedule === "recurring" && Array.isArray(order.occurrences)) {
    const upcoming = order.occurrences
      .filter((o: any) => o.status === "upcoming")
      .map((o: any) => parseSgt(o.scheduled_at))
      .filter((d: Date | null): d is Date => !!d)
      .sort((a: Date, b: Date) => a.getTime() - b.getTime());
    return upcoming[0] ?? null;
  }
  return parseSgt(order.scheduled_at) ?? parseSgt(order.placed_at ?? order.date);
}

const isMissed = (b: any) =>
  b.status === "Upcoming" && !!b.dueAt && Date.now() - b.dueAt.getTime() >= MISSED_GRACE_MS;

export default function BookingsPage() {
  const [bookings, setBookings]         = useState<any[]>([]);
  const [loading, setLoading]           = useState(true);
  const [activeTab, setActiveTab]       = useState(0);
  const [search, setSearch]             = useState("");
  const [page, setPage]                 = useState(1);
  const [pageSize, setPageSize]         = useState(10);
  const [selected, setSelected]         = useState<any | null>(null);
  const [menuOpenId, setMenuOpenId]     = useState<string | null>(null);
  const [updatingId, setUpdatingId]     = useState<string | null>(null);
  const [tick, setTick]                 = useState(0);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [menuPosition, setMenuPosition] = useState<React.CSSProperties>({});

  useLayoutEffect(() => {
    if (!menuOpenId) return;

    function positionMenu() {
      const trigger = menuTriggerRef.current;
      const menu = menuRef.current;
      if (!trigger || !menu) return;
      const rect = trigger.getBoundingClientRect();
      const margin = 8;
      const gap = 4;
      const viewportHeight = window.innerHeight;
      const viewportWidth = document.documentElement.clientWidth;
      if (rect.bottom < 0 || rect.top > viewportHeight || rect.right < 0 || rect.left > viewportWidth) {
        setMenuOpenId(null);
        return;
      }
      const below = Math.max(0, viewportHeight - rect.bottom - gap - margin);
      const above = Math.max(0, rect.top - gap - margin);
      const height = menu.scrollHeight + 2;
      const openAbove = below < height && above > below;
      const maxHeight = openAbove ? above : below;
      setMenuPosition({
        left: Math.max(margin, Math.min(rect.right - menu.offsetWidth, viewportWidth - menu.offsetWidth - margin)),
        top: openAbove ? Math.max(margin, rect.top - gap - Math.min(height, maxHeight)) : rect.bottom + gap,
        maxHeight,
      });
    }

    function handleScroll(e: Event) {
      if (!menuRef.current?.contains(e.target as Node)) positionMenu();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuOpenId(null);
        menuTriggerRef.current?.focus();
      }
    }
    positionMenu();
    window.addEventListener("resize", positionMenu);
    document.addEventListener("scroll", handleScroll, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("resize", positionMenu);
      document.removeEventListener("scroll", handleScroll, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpenId]);

  useEffect(() => {
    fetchBookings();
    // Re-check "missed" every minute while the page stays open.
    const timer = setInterval(() => setTick(n => n + 1), 60000);
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) && !menuTriggerRef.current?.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      clearInterval(timer);
    };
  }, []);

  async function fetchBookings() {
    try {
      const res  = await apiFetch("/api/orders");
      const json = await res.json();
      if (json.data) {
        const mapped = json.data.map((order: any) => {
          let serviceNames = "—";
          let allItems: any[] = [];
          try {
            const items = typeof order.items === "string" ? JSON.parse(order.items) : order.items;
            if (Array.isArray(items) && items.length > 0) {
              allItems = items;
              serviceNames = items.map((it: any) => it.name || it.serviceName || "Service").join(", ");
            }
          } catch {}
          let status = order.status || "upcoming";
          if (status === "upcoming")  status = "Upcoming";
          if (status === "completed") status = "Completed";
          if (status === "cancelled") status = "Cancelled";
          return {
            id:       order.booking_id ? `#${order.booking_id}` : `#ORD-${order.id}`,
            dbId:     order.id,
            customer: order.clientName  || order.contact_name  || "Unknown",
            phone:    order.clientMobile || order.contact_phone || "—",
            city:     order.city || order.contact_city || "—",
            address:  order.address || order.contact_address || "—",
            service:  serviceNames,
            items:    allItems,
            payment:  order.payment || "—",
            schedule: order.schedule || "—",
            dueAt:    dueAtOf(order),
            provider: order.providerName || "Unassigned",
            providerRating: order.providerRating || null,
            occurrences: order.occurrences || [],
            history: typeof order.history === "string" ? JSON.parse(order.history) : (order.history || []),
            amount:   Number(order.amount || order.total || 0),
            status,
            date: parseSgt(order.date || order.placed_at)?.toLocaleString("en-IN", {
              month: "short", day: "numeric", year: "numeric",
              hour: "2-digit", minute: "2-digit",
              timeZone: "Asia/Singapore",
            }) ?? "—",
          };
        });
        setBookings(mapped);
        setSelected((prev: any) => prev ? mapped.find((b: any) => b.dbId === prev.dbId) || null : null);
      }
    } catch (err) {
      console.error("Failed to fetch bookings", err);
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(booking: any, newStatus: string) {
    setMenuOpenId(null);
    setUpdatingId(booking.id);
    try {
      const res = await apiFetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: booking.dbId, status: newStatus.toLowerCase() }),
      });
      if (!res.ok) throw new Error();
      setBookings(prev => prev.map(b => b.id === booking.id ? { ...b, status: newStatus } : b));
      setSelected((prev: any) => prev?.id === booking.id ? { ...prev, status: newStatus } : prev);
    } catch {
      alert("Could not update booking status. Please try again.");
    } finally {
      setUpdatingId(null);
    }
  }

  const tabFilter = TABS[activeTab].filter;
  const filtered = bookings.filter((b) => {
    const q = search.toLowerCase();
    const matchSearch =
      b.id.toLowerCase().includes(q) ||
      b.customer.toLowerCase().includes(q) ||
      b.phone.includes(q) ||
      b.service.toLowerCase().includes(q) ||
      b.city.toLowerCase().includes(q);
    const matchTab = !tabFilter || b.status === tabFilter;
    return matchSearch && matchTab;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const paginatedBookings = filtered.slice(pageStart, pageStart + pageSize);

  useEffect(() => {
    setPage(p => Math.min(p, totalPages));
  }, [totalPages]);

  useEffect(() => {
    setMenuOpenId(null);
  }, [currentPage, pageSize, activeTab, search]);

  // Slots that have passed with the job still unmarked — most overdue first.
  const missedJobs = useMemo(
    () => bookings.filter(isMissed).sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime()),
    [bookings, tick]
  );

  // Summary counts
  const counts = {
    total:     bookings.length,
    upcoming:  bookings.filter(b => b.status === "Upcoming").length,
    completed: bookings.filter(b => b.status === "Completed").length,
    cancelled: bookings.filter(b => b.status === "Cancelled").length,
    revenue:   bookings.filter(b => b.status === "Completed").reduce((s, b) => s + b.amount, 0),
  };

  return (
    <div className="relative space-y-5 pb-6">

      {/* Missed jobs alert — slots that passed without being marked done */}
      {missedJobs.length > 0 && (
        <div className="rounded-2xl border border-dustyrose/50 bg-dustyrose/10 px-5 py-4 flex items-center gap-3">
          <AlertTriangle size={22} className="text-rosewood shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-rosewood">
              {missedJobs.length} missed {missedJobs.length === 1 ? "job" : "jobs"} — slot passed and still not marked done
            </p>
            <p className="text-xs text-rosewood/80 truncate mt-0.5">
              {missedJobs.slice(0, 3).map(b => `${b.id} · ${b.customer} · ${b.provider}`).join("   •   ")}
              {missedJobs.length > 3 ? `   •   +${missedJobs.length - 3} more` : ""}
            </p>
          </div>
          <button
            onClick={() => { setActiveTab(1); setPage(1); }}
            className="shrink-0 rounded-xl bg-terracotta hover:bg-accent-600 text-white text-xs font-semibold px-4 py-2 transition-colors"
          >
            Review upcoming
          </button>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: "Total Bookings", value: counts.total.toLocaleString(),          icon: ShoppingCart, color: "bg-terracotta"  },
          { label: "Upcoming",       value: counts.upcoming.toLocaleString(),        icon: Clock,        color: "bg-terracotta"   },
          { label: "Completed",      value: counts.completed.toLocaleString(),       icon: CheckCircle,  color: "bg-sage"},
          { label: "Revenue",        value: `S$${counts.revenue.toLocaleString()}`,   icon: DollarSign,  color: "bg-terracotta" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-lightstone shadow-sm p-5">
            <div className="flex items-start justify-between mb-3">
              <div className={clsx("w-10 h-10 rounded-xl flex items-center justify-center", color)}>
                <Icon size={18} className="text-white" />
              </div>
              {label === "Cancelled" && counts.cancelled > 0 && (
                <span className="text-xs font-semibold text-rosewood bg-dustyrose/10 px-2 py-0.5 rounded-lg">{counts.cancelled}</span>
              )}
            </div>
            <p className="text-xl font-bold text-charcoal">{value}</p>
            <p className="text-sm text-warmgrey mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Tabs + Search toolbar */}
      <div className="bg-white rounded-2xl border border-lightstone shadow-sm overflow-hidden">
        {/* Tab strip */}
        <div className="flex items-center justify-between border-b border-lightstone px-4">
          <div className="flex">
            {TABS.map((tab, i) => {
              const count = i === 0 ? counts.total
                : i === 1 ? counts.upcoming
                : i === 2 ? counts.completed
                : counts.cancelled;
              return (
                <button
                  key={tab.label}
                  onClick={() => { setActiveTab(i); setPage(1); }}
                  className={clsx(
                    "flex items-center gap-2 px-4 py-3.5 text-sm font-semibold border-b-2 transition whitespace-nowrap",
                    activeTab === i
                      ? "border-indigo-600 text-terracotta"
                      : "border-transparent text-warmgrey hover:text-terracotta"
                  )}
                >
                  {tab.label}
                  <span className={clsx(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded-md",
                    activeTab === i ? "bg-accent-100 text-terracotta" : "bg-accent-50 text-warmgrey"
                  )}>{count}</span>
                </button>
              );
            })}
          </div>
          {/* Search */}
          <div className="relative py-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-warmgrey" />
            <input
              type="text"
              placeholder="Search bookings…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="pl-8 pr-4 py-2 text-sm bg-gray-50 border border-lightstone rounded-xl focus:outline-none focus:ring-2 focus:ring-terracotta/30 w-56 transition"
            />
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <div className="flex gap-1.5">
                {[0,1,2].map(i => (
                  <div key={i} className="w-2 h-2 rounded-full bg-terracotta animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
              <p className="text-sm text-warmgrey">Loading bookings…</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-lightstone">
                  {["Booking ID", "Customer", "Service", "Provider", "Date", "Amount", "Status", ""].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-warmgrey uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-lightstone/50">
                {paginatedBookings.map((b, i) => {
                  const st = statusCfg[b.status] ?? statusCfg["Upcoming"];
                  const isUpdating = updatingId === b.id;
                  return (
                    <tr key={b.id} className="hover:bg-accent-50/60 transition group">
                      <td className="px-4 py-3 font-semibold text-terracotta whitespace-nowrap text-xs">{b.id}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          <div className={clsx("w-7 h-7 rounded-lg flex items-center justify-center text-white text-[10px] font-bold shrink-0", avatarColors[(pageStart + i) % avatarColors.length])}>
                            {getInitials(b.customer)}
                          </div>
                          <div>
                            <p className="font-semibold text-charcoal leading-tight text-xs">{b.customer}</p>
                            <p className="text-[10px] text-warmgrey leading-tight">{b.phone}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 max-w-[160px]">
                        <p className="text-xs text-warmgrey font-medium truncate">{b.service}</p>
                        <p className="text-[10px] text-warmgrey capitalize">{b.schedule}</p>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="text-xs text-warmgrey font-medium">{b.provider}</p>
                        {b.providerRating && (
                          <p className="text-[10px] text-accent-700">★ {b.providerRating}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-warmgrey whitespace-nowrap">{b.date}</td>
                      <td className="px-4 py-3 font-semibold text-charcoal whitespace-nowrap text-xs">S${b.amount.toLocaleString()}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={clsx("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[11px] font-semibold", st.cls)}>
                          <span className={clsx("w-1.5 h-1.5 rounded-full", st.dot)} />
                          {st.label}
                        </span>
                        {isMissed(b) && (
                          <p className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-dustyrose/15 text-rosewood text-[10px] font-bold uppercase tracking-wide">
                            <AlertTriangle size={10} /> Missed
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setSelected(b)}
                            className="p-1.5 rounded-lg hover:bg-accent-50 text-warmgrey hover:text-terracotta transition"
                            title="View details"
                          >
                            <Eye size={14} />
                          </button>
                          <div className="relative">
                            <button
                              onClick={(e) => {
                                menuTriggerRef.current = e.currentTarget;
                                setMenuOpenId(menuOpenId === b.id ? null : b.id);
                              }}
                              disabled={isUpdating}
                              aria-label={`Actions for booking ${b.id}`}
                              aria-expanded={menuOpenId === b.id}
                              aria-controls={menuOpenId === b.id ? "booking-actions" : undefined}
                              className="p-1.5 rounded-lg hover:bg-accent-50 text-warmgrey hover:text-warmgrey transition disabled:opacity-40"
                              title="Actions"
                            >
                              {isUpdating
                                ? <span className="w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin inline-block" />
                                : <span className="text-sm leading-none font-bold tracking-widest">···</span>
                              }
                            </button>
                            {menuOpenId === b.id && createPortal(
                              <div
                                id="booking-actions"
                                ref={menuRef}
                                style={menuPosition}
                                className="fixed z-[60] w-44 max-w-[calc(100vw-16px)] overflow-y-auto bg-white rounded-xl shadow-lg border border-lightstone py-1 text-sm"
                              >
                                <button onClick={() => { setSelected(b); setMenuOpenId(null); }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-warmgrey hover:bg-accent-50">
                                  <Eye size={13} className="text-terracotta" /> View Details
                                </button>
                                <button onClick={() => updateStatus(b, "Completed")} disabled={b.status === "Completed"}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-warmgrey hover:bg-accent-50 disabled:opacity-40 disabled:cursor-not-allowed">
                                  <CheckCircle size={13} className="text-sage" /> Mark Completed
                                </button>
                                <button onClick={() => updateStatus(b, "Upcoming")} disabled={b.status === "Upcoming"}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-warmgrey hover:bg-accent-50 disabled:opacity-40 disabled:cursor-not-allowed">
                                  <CalendarClock size={13} className="text-terracotta" /> Mark Upcoming
                                </button>
                                <div className="my-1 border-t border-lightstone" />
                                <button onClick={() => updateStatus(b, "Cancelled")} disabled={b.status === "Cancelled"}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-rosewood hover:bg-dustyrose/10 disabled:opacity-40 disabled:cursor-not-allowed">
                                  <XCircle size={13} className="text-rosewood" /> Cancel
                                </button>
                              </div>,
                              document.body
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="text-center py-16">
                <ShoppingCart size={32} className="text-lightstone mx-auto mb-3" />
                <p className="text-sm text-warmgrey">No bookings found.</p>
              </div>
            )}
          </div>
        )}
        {/* Footer */}
        {!loading && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-lightstone/50 text-xs text-warmgrey">
            <p aria-live="polite">
              Showing <span className="font-semibold">{filtered.length ? pageStart + 1 : 0}–{Math.min(pageStart + pageSize, filtered.length)}</span> of{" "}
              <span className="font-semibold">{filtered.length}</span> bookings
              {filtered.length !== bookings.length && ` (${bookings.length} total)`}
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2">
                Rows per page
                <select
                  value={pageSize}
                  onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                  className="rounded-lg border border-lightstone bg-white px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-terracotta/30"
                >
                  {[10, 25, 50].map(size => <option key={size} value={size}>{size}</option>)}
                </select>
              </label>
              <nav aria-label="Orders pagination" className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="rounded-lg border border-lightstone px-3 py-1.5 font-semibold hover:bg-accent-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span>Page {currentPage} of {totalPages}</span>
                <button
                  type="button"
                  onClick={() => setPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="rounded-lg border border-lightstone px-3 py-1.5 font-semibold hover:bg-accent-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </nav>
            </div>
          </div>
        )}
      </div>

      {/* Detail drawer */}
      {selected && (
        <div
          className="absolute inset-0 z-50 flex items-start justify-end"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white h-full w-full max-w-sm shadow-2xl flex flex-col overflow-y-auto border-l border-lightstone"
            onClick={e => e.stopPropagation()}
          >
            {/* Drawer header */}
            <div className="flex items-start justify-between px-5 py-4 border-b border-lightstone shrink-0">
              <div>
                <p className="text-xs text-warmgrey font-medium mb-1">Booking Details</p>
                <p className="text-sm font-bold text-terracotta">{selected.id}</p>
                <span className={clsx("inline-flex items-center gap-1.5 mt-1.5 px-2 py-0.5 rounded-lg text-[11px] font-semibold", (statusCfg[selected.status] ?? statusCfg["Upcoming"]).cls)}>
                  <span className={clsx("w-1.5 h-1.5 rounded-full", (statusCfg[selected.status] ?? statusCfg["Upcoming"]).dot)} />
                  {selected.status}
                </span>
              </div>
              <button onClick={() => setSelected(null)} className="p-1.5 hover:bg-accent-50 rounded-lg transition mt-0.5">
                <X size={16} className="text-warmgrey" />
              </button>
            </div>

            {/* Detail sections */}
            <div className="flex-1 px-5 py-4 space-y-5">
              {/* Customer */}
              <div>
                <p className="text-[10px] uppercase tracking-widest text-warmgrey font-semibold mb-2">Customer</p>
                <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <User size={13} className="text-terracotta shrink-0" />
                    <span className="font-semibold text-charcoal">{selected.customer}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Phone size={13} className="text-terracotta shrink-0" />
                    <span className="text-warmgrey">{selected.phone}</span>
                  </div>
                  <div className="flex items-start gap-2 text-sm">
                    <MapPin size={13} className="text-terracotta shrink-0 mt-0.5" />
                    <span className="text-warmgrey text-xs">{selected.address}{selected.city !== "—" ? `, ${selected.city}` : ""}</span>
                  </div>
                </div>
              </div>

              {/* Service */}
              <div>
                <p className="text-[10px] uppercase tracking-widest text-warmgrey font-semibold mb-2">Service</p>
                <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Package size={13} className="text-terracotta shrink-0" />
                    <span className="text-warmgrey font-medium">{selected.service}</span>
                  </div>
                  {selected.items?.length > 0 && (
                    <div className="space-y-1 pt-1">
                      {selected.items.map((item: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between text-xs text-warmgrey pl-5">
                          <span>{item.name || item.serviceName || "Item"}</span>
                          {item.price && <span className="font-semibold text-warmgrey">S${Number(item.price).toLocaleString()}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Booking info */}
              <div>
                <p className="text-[10px] uppercase tracking-widest text-warmgrey font-semibold mb-2">Booking Info</p>
                <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar size={13} className="text-terracotta shrink-0" />
                    <span className="text-warmgrey">{selected.date}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CreditCard size={13} className="text-terracotta shrink-0" />
                    <span className="text-warmgrey capitalize">{selected.payment}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm pt-1 border-t border-lightstone mt-1">
                    <span className="text-warmgrey font-medium">Total</span>
                    <span className="font-bold text-charcoal">S${selected.amount.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Provider */}
              <div>
                <p className="text-[10px] uppercase tracking-widest text-warmgrey font-semibold mb-2">Provider</p>
                <div className="bg-gray-50 rounded-xl p-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-accent-100 flex items-center justify-center">
                    <User size={14} className="text-terracotta" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-charcoal">{selected.provider}</p>
                    {selected.providerRating && (
                      <p className="text-xs text-accent-700">★ {selected.providerRating}</p>
                    )}
                  </div>
                </div>
                {selected.status === "Upcoming" && (
                  <BookingAssignment key={selected.dbId} booking={selected} onSaved={fetchBookings} />
                )}
                {(selected.history || []).filter((h: any) => h.type === "provider_reassigned").slice(-3).reverse().map((h: any, i: number) => (
                  <p key={i} className="mt-2 text-xs text-warmgrey">{h.at} · {h.note}</p>
                ))}
              </div>
            </div>

            {/* Action buttons */}
            <div className="px-5 py-4 border-t border-lightstone space-y-2 shrink-0">
              <div className="flex gap-2">
                <button
                  onClick={() => updateStatus(selected, "Completed")}
                  disabled={selected.status === "Completed" || updatingId === selected.id}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-semibold rounded-xl bg-sage/10 text-sage hover:bg-sage/10 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <CheckCircle size={14} /> Completed
                </button>
                <button
                  onClick={() => updateStatus(selected, "Upcoming")}
                  disabled={selected.status === "Upcoming" || updatingId === selected.id}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-semibold rounded-xl bg-accent-50 text-terracotta hover:bg-blue-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <CalendarClock size={14} /> Upcoming
                </button>
              </div>
              <button
                onClick={() => updateStatus(selected, "Cancelled")}
                disabled={selected.status === "Cancelled" || updatingId === selected.id}
                className="w-full flex items-center justify-center gap-1.5 py-2 text-sm font-semibold rounded-xl bg-dustyrose/10 text-rosewood hover:bg-dustyrose/10 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Ban size={14} /> Cancel Booking
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
