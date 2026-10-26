import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export default function BookingAssignment({ booking, onSaved }: { booking: any; onSaved: () => Promise<void> }) {
  const [scope, setScope] = useState("");
  const [providers, setProviders] = useState<any[]>([]);
  const [providerId, setProviderId] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [refresh, setRefresh] = useState(0);
  const visits = (booking.occurrences || []).filter((v: any) => v.status === "upcoming");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setProviderId("");
    apiFetch(`/api/bookings/${booking.dbId}/assignment-options${scope ? `?occurrenceId=${scope}` : ""}`)
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not load providers.");
        if (active) setProviders(data.providers);
      })
      .catch(err => { if (active) { setProviders([]); setError(err.message); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [booking.dbId, scope, refresh]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await apiFetch(`/api/bookings/${booking.dbId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_id: Number(providerId), occurrenceId: scope ? Number(scope) : null, reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not reassign provider.");
      setMessage(data.warning || "Provider assignment updated.");
      setReason("");
      setRefresh(n => n + 1);
      await onSaved();
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={save} className="mt-3 space-y-3">
      <p className="text-xs text-warmgrey">Choose a qualified replacement from any active vendor or the independent provider pool.</p>
      {booking.schedule === "recurring" && (
        <label className="block text-xs font-semibold">Change assignment for
          <select value={scope} onChange={e => { setScope(e.target.value); setMessage(""); }} disabled={saving}
            className="mt-1 w-full rounded-lg border border-lightstone bg-white p-2 text-sm">
            <option value="">All remaining visits and future repeats</option>
            {visits.map((v: any) => (
              <option key={v.id} value={v.id}>Visit #{v.seq} · {v.scheduled_at} · {v.provider_name || "Unassigned"}</option>
            ))}
          </select>
        </label>
      )}
      <label className="block text-xs font-semibold">Replacement provider
        <select required value={providerId} onChange={e => setProviderId(e.target.value)} disabled={loading || saving}
          className="mt-1 w-full rounded-lg border border-lightstone bg-white p-2 text-sm">
          <option value="">{loading ? "Checking availability…" : "Select a provider"}</option>
          {providers.map(p => <option key={p.id} value={p.id} disabled={!p.available || p.current}>
            {p.name} · {p.vendorName}{p.current ? " — current" : !p.available ? ` — ${p.reason || "unavailable"}` : ""}
          </option>)}
        </select>
      </label>
      {!loading && !error && !providers.some(p => p.available && !p.current) && (
        <p className="text-xs text-rosewood">No qualified replacement is available for this selection. For recurring work, try an individual visit.</p>
      )}
      <label className="block text-xs font-semibold">Reason for change
        <textarea required maxLength={500} value={reason} onChange={e => setReason(e.target.value)} disabled={saving}
          placeholder="For example: assigned provider is sick" rows={2}
          className="mt-1 w-full rounded-lg border border-lightstone p-2 text-sm font-normal" />
      </label>
      {error && <p role="alert" className="text-xs text-rosewood">{error}</p>}
      {message && <p role="status" className="text-xs text-charcoal">{message}</p>}
      <button disabled={loading || saving || !providerId || !reason.trim()}
        className="w-full rounded-xl bg-terracotta px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">
        {saving ? "Saving…" : "Confirm reassignment"}
      </button>
      <p className="text-xs text-warmgrey">Providers need availability and approved vendor rates for every booked service. Both are checked again when you confirm.</p>
    </form>
  );
}
