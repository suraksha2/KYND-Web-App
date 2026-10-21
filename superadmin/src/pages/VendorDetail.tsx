import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Search, Store } from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { usePagination } from "@/lib/usePagination";
import TablePagination from "@/components/TablePagination";

type Vendor = {
  id: number;
  name: string;
  city: string;
  contactEmail: string;
  mobile: string | null;
  status: string;
};

type Service = {
  id: string;
  category: string;
  subcategory: string | null;
  name: string;
  unit: string | null;
  price: number | null;
  status: string;
};

const statuses: Record<string, { label: string; cls: string }> = {
  live: { label: "Live", cls: "bg-sage/10 text-sage" },
  under_review: { label: "Under review", cls: "bg-accent-100 text-terracotta" },
  draft: { label: "Draft", cls: "bg-lightstone/60 text-warmgrey" },
  rejected: { label: "Rejected", cls: "bg-dustyrose/10 text-rosewood" },
};

const units: Record<string, string> = {
  hour: "per hour", sqft: "per sq ft", day: "per day", job: "per job",
};

export default function VendorDetailPage() {
  const { id } = useParams();
  // Remount when navigating between vendors so filters and fetched data reset.
  return <VendorServicesDetail key={id} vendorId={id || ""} />;
}

function VendorServicesDetail({ vendorId }: { vendorId: string }) {
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    apiFetch(`/api/vendors/${encodeURIComponent(vendorId)}/services`, { signal: controller.signal })
      .then(async res => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to load vendor services.");
        if (!controller.signal.aborted) {
          setVendor(json.vendor);
          setServices(json.services);
        }
      })
      .catch(err => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Failed to load vendor services.");
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [vendorId, retry]);

  const query = search.trim().toLowerCase();
  const filtered = services.filter(service =>
    (!status || service.status === status) &&
    [service.name, service.category, service.subcategory || ""].some(value => value.toLowerCase().includes(query))
  );
  const { pageItems, pagination, resetPage } = usePagination(filtered);

  return (
    <div className="space-y-5 pb-6">
      <Link to="/vendors" className="inline-flex items-center gap-2 text-sm font-semibold text-terracotta hover:underline">
        <ArrowLeft size={16} /> Back to vendors
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-charcoal">{vendor?.name || "Vendor services"}</h1>
        <p className="text-sm text-warmgrey mt-1">Services &amp; prices</p>
        {vendor && (
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <span className={clsx("rounded-lg px-2 py-0.5 text-xs font-semibold capitalize",
              vendor.status === "active" ? "bg-sage/10 text-sage" : "bg-lightstone/60 text-warmgrey")}>
              {vendor.status}
            </span>
            <p className="text-xs text-warmgrey">
              {[vendor.city, vendor.contactEmail, vendor.mobile].filter(Boolean).join(" · ")}
            </p>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-lightstone shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-warmgrey">
            <Loader2 size={20} className="animate-spin text-terracotta" /> Loading services…
          </div>
        ) : error ? (
          <div className="text-center py-16 px-4">
            <p role="alert" className="text-sm text-rosewood">{error}</p>
            <button onClick={() => setRetry(n => n + 1)} className="mt-2 text-sm text-terracotta font-medium hover:underline">
              Retry
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-lightstone">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-warmgrey" />
                <input
                  aria-label="Search vendor services"
                  placeholder="Search services or categories…"
                  value={search}
                  onChange={e => { setSearch(e.target.value); resetPage(); }}
                  className="w-full pl-8 pr-3 py-2 text-sm border border-lightstone rounded-xl focus:outline-none focus:ring-2 focus:ring-terracotta/30"
                />
              </div>
              <select
                aria-label="Filter by listing status"
                value={status}
                onChange={e => { setStatus(e.target.value); resetPage(); }}
                className="px-3 py-2 text-sm border border-lightstone rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-terracotta/30"
              >
                <option value="">All statuses</option>
                {Object.entries(statuses).map(([value, config]) => (
                  <option key={value} value={value}>{config.label}</option>
                ))}
              </select>
            </div>
            {filtered.length === 0 ? (
              <div className="text-center py-16 px-4">
                <Store size={32} className="text-lightstone mx-auto mb-3" />
                <p className="text-sm text-warmgrey">
                  {services.length === 0 ? "This vendor hasn't added any services or prices yet." : "No services match your filters."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-lightstone">
                      {["Service", "Category", "Rate / duration", "Vendor price", "Status"].map(heading => (
                        <th key={heading} className="px-4 py-3 text-left text-[11px] font-semibold text-warmgrey uppercase tracking-wide whitespace-nowrap">
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-lightstone/50">
                    {pageItems.map(service => {
                      const config = statuses[service.status];
                      return (
                        <tr key={service.id} className="hover:bg-accent-50/70 transition">
                          <td className="px-4 py-3 font-semibold text-charcoal">{service.name}</td>
                          <td className="px-4 py-3 text-warmgrey">
                            {service.category}
                            {service.subcategory && <p className="text-xs mt-0.5">{service.subcategory}</p>}
                          </td>
                          <td className="px-4 py-3 text-warmgrey">
                            {service.unit ? units[service.unit] || service.unit.replace(/_/g, " ") : "—"}
                          </td>
                          <td className="px-4 py-3 font-semibold text-charcoal whitespace-nowrap">
                            {service.price === null ? <span className="font-normal text-warmgrey">Not set</span> :
                              `S$${service.price.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={clsx("inline-flex rounded-lg px-2 py-0.5 text-[11px] font-semibold", config?.cls)}>
                              {config?.label || service.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <TablePagination {...pagination} label="services" overallTotal={services.length} />
          </>
        )}
      </div>
    </div>
  );
}
