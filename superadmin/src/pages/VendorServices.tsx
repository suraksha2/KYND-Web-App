import { useEffect, useState } from "react";
import { Check, Loader2, Store, X } from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";

type Listing = {
  id: number;
  vendor_id: number;
  vendor_name: string;
  category: string;
  unit: string;
  price: number;
  status: "draft" | "under_review" | "live" | "rejected";
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
};

type PartnerCategory = {
  id: number;
  vendor_id: number;
  vendor_name: string;
  category: string;
  subcategory: string;
  status: "draft" | "under_review" | "live" | "rejected";
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  item_count: number;
  priced_count: number;
};

type PartnerCategoryItem = { id: number; name: string; unit: string | null; price: number | null };

const UNIT_LABELS: Record<string, string> = { hour: "per hour", sqft: "per sq ft", day: "per day", job: "per job" };

const TABS: { key: string; label: string }[] = [
  { key: "under_review", label: "Pending review" },
  { key: "live", label: "Live" },
  { key: "rejected", label: "Rejected" },
  { key: "", label: "All" },
];

const VIEWS: { key: "flat" | "categories"; label: string }[] = [
  { key: "categories", label: "Service categories" },
  { key: "flat", label: "Flat pricing" },
];

const statusCfg: Record<string, string> = {
  draft: "bg-lightstone/60 text-warmgrey",
  under_review: "bg-accent-100 text-accent-700",
  live: "bg-sage/10 text-sage",
  rejected: "bg-dustyrose/10 text-rosewood",
};

function formatMoney(n: number) {
  return `S$${Number(n || 0).toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function VendorServicesPage() {
  const [view, setView] = useState<"flat" | "categories">("categories");

  return (
    <div className="space-y-5 pb-6">
      <div>
        <h1 className="text-2xl font-bold text-charcoal">Vendor pricing</h1>
        <p className="text-sm text-warmgrey mt-0.5">Review partner category pricing before it goes live on the customer storefront.</p>
      </div>

      <div className="inline-flex items-center gap-1 rounded-xl bg-warmlinen p-1">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={clsx(
              "px-3.5 py-1.5 rounded-lg text-sm font-semibold transition",
              view === v.key ? "bg-white text-charcoal shadow-sm" : "text-warmgrey hover:text-charcoal"
            )}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === "categories" ? <PartnerCategoriesPanel /> : <FlatPricingPanel />}
    </div>
  );
}

function FlatPricingPanel() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("under_review");
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState<Listing | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const qs = tab ? `?status=${tab}` : "";
      const res = await apiFetch(`/api/vendor-services${qs}`);
      const json = await res.json();
      if (res.ok && Array.isArray(json.data)) {
        setListings(json.data);
      } else if (res.status === 401) {
        setError("Session expired or missing. Signing out…");
        await logout();
        navigate("/login");
      } else {
        setError(json.error || "Failed to load vendor listings.");
      }
    } catch {
      setError("Failed to connect to server.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function act(id: number, action: "approve" | "reject", note?: string) {
    setBusyId(id);
    try {
      const res = await apiFetch(`/api/vendor-services/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update listing.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update listing.");
    } finally {
      setBusyId(null);
      setRejecting(null);
      setRejectNote("");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.key || "all"}
            onClick={() => setTab(t.key)}
            className={clsx(
              "px-3.5 py-1.5 rounded-xl text-sm font-semibold border transition",
              tab === t.key ? "bg-terracotta text-white border-terracotta" : "bg-white text-warmgrey border-lightstone hover:text-charcoal"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-lightstone shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-terracotta" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16">
            <p className="text-sm text-rosewood">{error}</p>
            <button onClick={load} className="mt-2 text-sm text-terracotta font-medium hover:underline">Retry</button>
          </div>
        ) : listings.length === 0 ? (
          <div className="text-center py-16">
            <Store size={32} className="text-lightstone mx-auto mb-3" />
            <p className="text-sm text-warmgrey">No listings here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-lightstone">
                  {["Vendor", "Category", "Price", "Status", "Submitted", ""].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-warmgrey uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-lightstone/50">
                {listings.map((l) => (
                  <tr key={l.id} className="hover:bg-accent-50/70 transition">
                    <td className="px-4 py-3 font-semibold text-charcoal whitespace-nowrap">{l.vendor_name}</td>
                    <td className="px-4 py-3 text-warmgrey whitespace-nowrap">{l.category}</td>
                    <td className="px-4 py-3 text-charcoal font-semibold whitespace-nowrap">{formatMoney(l.price)} {UNIT_LABELS[l.unit] || l.unit}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={clsx("inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-semibold capitalize", statusCfg[l.status])}>
                        {l.status.replace("_", " ")}
                      </span>
                      {l.status === "rejected" && l.review_note && (
                        <p className="mt-1 text-[11px] text-rosewood max-w-xs truncate" title={l.review_note}>{l.review_note}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-warmgrey whitespace-nowrap">{new Date(l.created_at).toLocaleDateString("en-SG")}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {l.status === "under_review" && (
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => act(l.id, "approve")}
                            disabled={busyId === l.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-sage bg-sage/10 hover:bg-sage/20 rounded-lg transition disabled:opacity-60"
                          >
                            <Check size={12} /> Approve
                          </button>
                          <button
                            onClick={() => { setRejecting(l); setRejectNote(""); }}
                            disabled={busyId === l.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-rosewood bg-dustyrose/10 hover:bg-dustyrose/20 rounded-lg transition disabled:opacity-60"
                          >
                            <X size={12} /> Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {rejecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/20 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm border border-lightstone overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-lightstone">
              <h2 className="text-sm font-bold text-charcoal">Reject listing</h2>
              <button onClick={() => setRejecting(null)} className="p-1.5 hover:bg-accent-50 rounded-lg transition">
                <X size={16} className="text-warmgrey" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-warmgrey">{rejecting.vendor_name} · {rejecting.category}</p>
              <textarea
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="Tell the vendor what to fix (optional)"
                rows={3}
                className="w-full px-3 py-2 text-sm bg-gray-50 border border-lightstone rounded-xl focus:outline-none focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta transition"
              />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setRejecting(null)} className="px-3.5 py-2 text-sm font-semibold text-charcoal rounded-xl hover:bg-warmlinen transition">Cancel</button>
                <button
                  onClick={() => act(rejecting.id, "reject", rejectNote)}
                  disabled={busyId === rejecting.id}
                  className="px-3.5 py-2 text-sm font-semibold text-white bg-terracotta hover:bg-accent-700 rounded-xl transition disabled:opacity-60"
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PartnerCategoriesPanel() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("under_review");
  const [rows, setRows] = useState<PartnerCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState<PartnerCategory | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [viewing, setViewing] = useState<PartnerCategory | null>(null);
  const [viewItems, setViewItems] = useState<PartnerCategoryItem[] | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const qs = tab ? `?status=${tab}` : "";
      const res = await apiFetch(`/api/vendor-services/partner-categories${qs}`);
      const json = await res.json();
      if (res.ok && Array.isArray(json.data)) {
        setRows(json.data);
      } else if (res.status === 401) {
        setError("Session expired or missing. Signing out…");
        await logout();
        navigate("/login");
      } else {
        setError(json.error || "Failed to load vendor service categories.");
      }
    } catch {
      setError("Failed to connect to server.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function act(id: number, action: "approve" | "reject", note?: string) {
    setBusyId(id);
    try {
      const res = await apiFetch(`/api/vendor-services/partner-categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update category.");
      setViewing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update category.");
    } finally {
      setBusyId(null);
      setRejecting(null);
      setRejectNote("");
    }
  }

  async function openView(row: PartnerCategory) {
    setViewing(row);
    setViewItems(null);
    setViewLoading(true);
    try {
      const res = await apiFetch(`/api/vendor-services/partner-categories/${row.id}/items`);
      const json = await res.json();
      if (res.ok) setViewItems(json.items || []);
    } finally {
      setViewLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.key || "all"}
            onClick={() => setTab(t.key)}
            className={clsx(
              "px-3.5 py-1.5 rounded-xl text-sm font-semibold border transition",
              tab === t.key ? "bg-terracotta text-white border-terracotta" : "bg-white text-warmgrey border-lightstone hover:text-charcoal"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-lightstone shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-terracotta" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16">
            <p className="text-sm text-rosewood">{error}</p>
            <button onClick={load} className="mt-2 text-sm text-terracotta font-medium hover:underline">Retry</button>
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16">
            <Store size={32} className="text-lightstone mx-auto mb-3" />
            <p className="text-sm text-warmgrey">No service categories here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-lightstone">
                  {["Vendor", "Category", "Prices", "Status", "Submitted", ""].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-warmgrey uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-lightstone/50">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-accent-50/70 transition">
                    <td className="px-4 py-3 font-semibold text-charcoal whitespace-nowrap">{r.vendor_name}</td>
                    <td className="px-4 py-3 text-warmgrey whitespace-nowrap">
                      <button onClick={() => openView(r)} className="text-charcoal font-medium hover:text-terracotta hover:underline">
                        {r.category} · {r.subcategory}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-charcoal whitespace-nowrap">{r.priced_count} of {r.item_count} priced</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={clsx("inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-semibold capitalize", statusCfg[r.status])}>
                        {r.status.replace("_", " ")}
                      </span>
                      {r.status === "rejected" && r.review_note && (
                        <p className="mt-1 text-[11px] text-rosewood max-w-xs truncate" title={r.review_note}>{r.review_note}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-warmgrey whitespace-nowrap">{new Date(r.created_at).toLocaleDateString("en-SG")}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {r.status === "under_review" && (
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => act(r.id, "approve")}
                            disabled={busyId === r.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-sage bg-sage/10 hover:bg-sage/20 rounded-lg transition disabled:opacity-60"
                          >
                            <Check size={12} /> Approve
                          </button>
                          <button
                            onClick={() => { setRejecting(r); setRejectNote(""); }}
                            disabled={busyId === r.id}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-rosewood bg-dustyrose/10 hover:bg-dustyrose/20 rounded-lg transition disabled:opacity-60"
                          >
                            <X size={12} /> Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/20 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-lightstone overflow-hidden max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-lightstone">
              <div>
                <h2 className="text-sm font-bold text-charcoal">{viewing.subcategory}</h2>
                <p className="text-xs text-warmgrey">{viewing.vendor_name} · {viewing.category}</p>
              </div>
              <button onClick={() => setViewing(null)} className="p-1.5 hover:bg-accent-50 rounded-lg transition">
                <X size={16} className="text-warmgrey" />
              </button>
            </div>
            <div className="p-5 space-y-2 overflow-y-auto">
              {viewLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-terracotta" />
                </div>
              ) : (
                (viewItems || []).map((it) => (
                  <div key={it.id} className="flex items-center justify-between text-sm">
                    <span className="text-charcoal">{it.name}{it.unit ? <span className="text-warmgrey"> · {it.unit.replace(/_/g, " ")}</span> : null}</span>
                    <span className="font-semibold text-charcoal">{it.price != null ? formatMoney(it.price) : "—"}</span>
                  </div>
                ))
              )}
            </div>
            {viewing.status === "under_review" && (
              <div className="flex gap-2 justify-end px-5 py-4 border-t border-lightstone">
                <button
                  onClick={() => { setRejecting(viewing); setRejectNote(""); }}
                  disabled={busyId === viewing.id}
                  className="px-3.5 py-2 text-sm font-semibold text-rosewood rounded-xl hover:bg-dustyrose/10 transition disabled:opacity-60"
                >
                  Reject
                </button>
                <button
                  onClick={() => act(viewing.id, "approve")}
                  disabled={busyId === viewing.id}
                  className="px-3.5 py-2 text-sm font-semibold text-white bg-terracotta hover:bg-accent-700 rounded-xl transition disabled:opacity-60"
                >
                  Approve
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {rejecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/20 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm border border-lightstone overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-lightstone">
              <h2 className="text-sm font-bold text-charcoal">Reject category</h2>
              <button onClick={() => setRejecting(null)} className="p-1.5 hover:bg-accent-50 rounded-lg transition">
                <X size={16} className="text-warmgrey" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-warmgrey">{rejecting.vendor_name} · {rejecting.category} · {rejecting.subcategory}</p>
              <textarea
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="Tell the vendor what to fix (optional)"
                rows={3}
                className="w-full px-3 py-2 text-sm bg-gray-50 border border-lightstone rounded-xl focus:outline-none focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta transition"
              />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setRejecting(null)} className="px-3.5 py-2 text-sm font-semibold text-charcoal rounded-xl hover:bg-warmlinen transition">Cancel</button>
                <button
                  onClick={() => act(rejecting.id, "reject", rejectNote)}
                  disabled={busyId === rejecting.id}
                  className="px-3.5 py-2 text-sm font-semibold text-white bg-terracotta hover:bg-accent-700 rounded-xl transition disabled:opacity-60"
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
