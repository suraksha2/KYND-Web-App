import { Fragment, useCallback, useEffect, useState } from "react";
import { Building2, ChevronDown, Download, Loader2, Play } from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import TablePagination from "@/components/TablePagination";
import { usePagination } from "@/lib/usePagination";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";

type Payout = {
  id: number;
  vendorId: number;
  vendorName: string;
  periodStart: string;
  periodEnd: string;
  jobs: number;
  gross: number;
  fee: number;
  net: number;
  status: "scheduled" | "pending" | "paid";
  paidAt: string | null;
  expectedDate: string | null;
};

type Summary = {
  pendingTotal: number;
  pendingCount: number;
  scheduledTotal: number;
  paidMonthTotal: number;
};

type PayoutJob = {
  id: number;
  serviceLabel: string;
  customerName: string;
  windowStart: string;
  gross: number;
  fee: number;
  net: number;
  status: string;
};

type PayoutDetail = {
  payout: Payout;
  vendor: {
    name: string;
    contactEmail: string | null;
    mobile: string | null;
    city: string | null;
    payoutDetails: Record<string, unknown> | null;
  };
  jobs: PayoutJob[];
};

const statusCfg: Record<string, string> = {
  scheduled: "bg-lightstone/60 text-warmgrey",
  pending: "bg-amber-100 text-amber-800",
  paid: "bg-sage/10 text-sage",
};

const TABS: { key: string; label: string }[] = [
  { key: "pending", label: "Needs payment" },
  { key: "scheduled", label: "Scheduled" },
  { key: "paid", label: "Paid" },
  { key: "", label: "All" },
];

function money(n: number): string {
  return `S$${Number(n || 0).toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDay(d: string | null | undefined): string {
  if (!d) return "—";
  const date = new Date(`${String(d).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-SG", { day: "numeric", month: "short" });
}

function DetailRow({ payoutId }: { payoutId: number }) {
  const [detail, setDetail] = useState<PayoutDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/api/vendors/payouts/${payoutId}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load payout.");
        if (!cancelled) setDetail(json);
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load payout."); });
    return () => { cancelled = true; };
  }, [payoutId]);

  if (error) {
    return <p className="px-4 py-4 text-sm text-rosewood">{error}</p>;
  }
  if (!detail) {
    return (
      <div className="px-4 py-5 flex items-center gap-2 text-warmgrey">
        <Loader2 size={14} className="animate-spin" />
        <span className="text-xs">Loading jobs…</span>
      </div>
    );
  }

  const { vendor, jobs } = detail;
  return (
    <div className="px-4 py-4 grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-warmgrey mb-2">Jobs in this payout</p>
        {jobs.length === 0 ? (
          <p className="text-sm text-warmgrey">No jobs in this payout yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-warmgrey">
                <th className="py-1.5 text-left font-semibold">When</th>
                <th className="py-1.5 text-left font-semibold">Job</th>
                <th className="py-1.5 text-left font-semibold">Customer</th>
                <th className="py-1.5 text-right font-semibold">Gross</th>
                <th className="py-1.5 text-right font-semibold">Fee</th>
                <th className="py-1.5 text-right font-semibold">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-lightstone/60">
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td className="py-2 pr-3 text-warmgrey whitespace-nowrap">{fmtDay(j.windowStart)}</td>
                  <td className="py-2 pr-3 text-charcoal">{j.serviceLabel}</td>
                  <td className="py-2 pr-3 text-warmgrey">{j.customerName}</td>
                  <td className="py-2 text-right text-charcoal whitespace-nowrap">{money(j.gross)}</td>
                  <td className="py-2 text-right text-warmgrey whitespace-nowrap">{money(j.fee)}</td>
                  <td className="py-2 text-right font-semibold text-charcoal whitespace-nowrap">{money(j.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="rounded-xl border border-lightstone bg-warmlinen/50 p-4 h-fit">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-warmgrey mb-2">Pay to</p>
        <p className="text-sm font-semibold text-charcoal">{vendor.name}</p>
        <p className="text-xs text-warmgrey mt-0.5">{[vendor.contactEmail, vendor.mobile, vendor.city].filter(Boolean).join(" · ") || "—"}</p>
        {vendor.payoutDetails && Object.keys(vendor.payoutDetails).length > 0 ? (
          <dl className="mt-3 space-y-1.5">
            {Object.entries(vendor.payoutDetails).map(([key, value]) => (
              <div key={key} className="flex justify-between gap-3 text-xs">
                <dt className="text-warmgrey capitalize">{key.replace(/_/g, " ")}</dt>
                <dd className="text-charcoal font-medium text-right">{String(value)}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-3 text-xs text-warmgrey">No payout details saved for this vendor yet.</p>
        )}
      </div>
    </div>
  );
}

export default function VendorPayoutsPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [payouts, setPayouts] = useState<Payout[]>([]);
  const { pageItems, pagination, resetPage } = usePagination(payouts);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [tab, setTab] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const load = useCallback(async (status: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/vendors/payouts${status ? `?status=${status}` : ""}`);
      const json = await res.json();
      if (res.ok) {
        setPayouts(json.payouts || []);
        setSummary(json.summary || null);
      } else if (res.status === 401) {
        setError("Session expired or missing. Signing out…");
        await logout();
        navigate("/login");
      } else {
        setError(json.error || "Failed to load payouts.");
      }
    } catch {
      setError("Failed to connect to server.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  async function runBatch() {
    setRunning(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch("/api/vendors/payouts/run", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to run the payout batch.");
      setNotice(
        `Batch complete — ${json.created} payout${json.created === 1 ? "" : "s"} created, ${json.updated} updated, ` +
        `${json.jobsBatched} job${json.jobsBatched === 1 ? "" : "s"} batched across ${json.vendors} vendor${json.vendors === 1 ? "" : "s"}.`
      );
      await load(tab);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run the payout batch.");
    } finally {
      setRunning(false);
    }
  }

  async function setStatus(payout: Payout, status: "pending" | "paid") {
    setBusyId(payout.id);
    setError(null);
    try {
      const res = await apiFetch(`/api/vendors/payouts/${payout.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update payout.");
      await load(tab);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update payout.");
    } finally {
      setBusyId(null);
    }
  }

  async function downloadStatement(payout: Payout) {
    setDownloadingId(payout.id);
    setError(null);
    try {
      const res = await apiFetch(`/api/vendors/payouts/${payout.id}/statement`);
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error || `Download failed (${res.status}).`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kynd-payout-${payout.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download statement.");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="space-y-5 pb-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-charcoal">Vendor payouts</h1>
          <p className="text-sm text-warmgrey mt-0.5">
            Weekly settlement of vendors' Kynd jobs. Batch the week, transfer the money, then mark it paid.
          </p>
        </div>
        <button
          onClick={runBatch}
          disabled={running}
          className="flex items-center gap-2 bg-terracotta hover:bg-accent-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
        >
          {running ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
          Run payout batch
        </button>
      </div>

      {notice && (
        <div className="rounded-xl border border-sage/30 bg-sage/10 text-sage text-sm px-4 py-3">{notice}</div>
      )}
      {error && (
        <div className="rounded-xl border border-rosewood/30 bg-dustyrose/10 text-rosewood text-sm px-4 py-3">{error}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-lightstone shadow-sm p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-warmgrey">Owed to vendors</p>
          <p className="mt-1.5 text-2xl font-bold text-charcoal">{money(summary?.pendingTotal || 0)}</p>
          <p className="text-xs text-warmgrey mt-0.5">
            {summary?.pendingCount ? `${summary.pendingCount} payout${summary.pendingCount === 1 ? "" : "s"} pending` : "Nothing pending"}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-lightstone shadow-sm p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-warmgrey">Accruing this week</p>
          <p className="mt-1.5 text-2xl font-bold text-charcoal">{money(summary?.scheduledTotal || 0)}</p>
          <p className="text-xs text-warmgrey mt-0.5">Scheduled — finalised when the week closes</p>
        </div>
        <div className="bg-white rounded-2xl border border-lightstone shadow-sm p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-warmgrey">Paid this month</p>
          <p className="mt-1.5 text-2xl font-bold text-charcoal">{money(summary?.paidMonthTotal || 0)}</p>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); resetPage(); setOpenId(null); }}
            className={clsx(
              "rounded-full px-3.5 py-1.5 text-xs font-semibold border transition",
              tab === t.key ? "bg-white border-terracotta text-terracotta" : "border-lightstone text-warmgrey hover:text-charcoal"
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
        ) : payouts.length === 0 ? (
          <div className="text-center py-16">
            <Building2 size={32} className="text-lightstone mx-auto mb-3" />
            <p className="text-sm text-warmgrey">
              {tab ? `No ${TABS.find((t) => t.key === tab)?.label.toLowerCase()} payouts.` : "No payouts yet — run the batch once vendors have completed jobs."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-lightstone">
                  {["Vendor", "Period", "Jobs", "Gross", "Fee", "Net", "Status", "Due / paid", ""].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-warmgrey uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-lightstone/50">
                {pageItems.map((p) => (
                  <Fragment key={p.id}>
                    <tr className="hover:bg-accent-50/70 transition">
                      <td className="px-4 py-3 font-semibold text-charcoal whitespace-nowrap">{p.vendorName}</td>
                      <td className="px-4 py-3 text-warmgrey whitespace-nowrap">{fmtDay(p.periodStart)} – {fmtDay(p.periodEnd)}</td>
                      <td className="px-4 py-3 text-warmgrey">{p.jobs}</td>
                      <td className="px-4 py-3 text-charcoal whitespace-nowrap">{money(p.gross)}</td>
                      <td className="px-4 py-3 text-warmgrey whitespace-nowrap">{money(p.fee)}</td>
                      <td className="px-4 py-3 font-semibold text-charcoal whitespace-nowrap">{money(p.net)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={clsx("inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-semibold capitalize", statusCfg[p.status])}>
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-warmgrey whitespace-nowrap">
                        {p.status === "paid" ? `Paid ${fmtDay(p.paidAt)}` : `Due ${fmtDay(p.expectedDate)}`}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          {p.status === "scheduled" && (
                            <button
                              onClick={() => setStatus(p, "pending")}
                              disabled={busyId === p.id}
                              className="px-2.5 py-1 text-xs font-semibold rounded-lg text-charcoal bg-accent-50 hover:bg-lightstone transition disabled:opacity-60"
                            >
                              Release early
                            </button>
                          )}
                          {p.status === "pending" && (
                            <button
                              onClick={() => setStatus(p, "paid")}
                              disabled={busyId === p.id}
                              className="px-2.5 py-1 text-xs font-semibold rounded-lg text-sage bg-sage/10 hover:bg-sage/20 transition disabled:opacity-60"
                            >
                              {busyId === p.id ? "Updating…" : "Mark paid"}
                            </button>
                          )}
                          <button
                            onClick={() => downloadStatement(p)}
                            disabled={downloadingId === p.id}
                            aria-label={`Download statement for payout ${p.id}`}
                            className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-lightstone text-warmgrey hover:text-terracotta hover:border-terracotta transition disabled:opacity-60"
                          >
                            {downloadingId === p.id ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                          </button>
                          <button
                            onClick={() => setOpenId(openId === p.id ? null : p.id)}
                            aria-label="Toggle payout details"
                            className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-warmgrey hover:bg-accent-50 hover:text-terracotta transition"
                          >
                            <ChevronDown size={15} className={clsx("transition-transform", openId === p.id && "rotate-180")} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {openId === p.id && (
                      <tr className="bg-warmlinen/40">
                        <td colSpan={9} className="p-0">
                          <DetailRow payoutId={p.id} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && !error && <TablePagination {...pagination} label="payouts" />}
      </div>
    </div>
  );
}
