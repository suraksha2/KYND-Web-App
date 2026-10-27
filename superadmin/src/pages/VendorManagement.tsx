import { useSearchParams } from "react-router-dom";
import clsx from "clsx";
import VendorOverview from "./VendorOverview";
import VendorsPage from "./Vendors";
import VendorServicesPage from "./VendorServices";
import VendorPayoutsPage from "./VendorPayouts";

// One entry point for the old Vendors / Vendor pricing / Vendor payouts
// sidebar items. The tab lives in the ?tab= query param so the legacy
// /vendor-services and /vendor-payouts routes can redirect here and keep
// deep links working.
const TABS = [
  { key: "overview", label: "Overview" },
  { key: "directory", label: "Directory" },
  { key: "pricing", label: "Pricing" },
  { key: "payouts", label: "Payouts" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function isTab(value: string | null): value is TabKey {
  return TABS.some((t) => t.key === value);
}

export default function VendorManagementPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: TabKey = isTab(searchParams.get("tab")) ? (searchParams.get("tab") as TabKey) : "overview";

  function setTab(key: TabKey) {
    setSearchParams(key === "overview" ? {} : { tab: key }, { replace: true });
  }

  return (
    <div className="space-y-5 pb-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-charcoal">Vendor management</h1>
          <p className="text-sm text-warmgrey mt-0.5">
            Partner performance, profitability, pricing approval and payouts in one place.
          </p>
        </div>
      </div>

      <div className="inline-flex items-center gap-1 rounded-xl bg-warmlinen p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              "px-3.5 py-1.5 rounded-lg text-sm font-semibold transition",
              tab === t.key ? "bg-white text-charcoal shadow-sm" : "text-warmgrey hover:text-charcoal"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <VendorOverview />}
      {tab === "directory" && <VendorsPage />}
      {tab === "pricing" && <VendorServicesPage />}
      {tab === "payouts" && <VendorPayoutsPage />}
    </div>
  );
}
