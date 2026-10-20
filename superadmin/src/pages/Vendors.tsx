import { useEffect, useState } from "react";
import { Building2, Loader2, Pencil, Plus, X } from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";

type Vendor = {
  id: number;
  name: string;
  contactEmail: string;
  mobile: string | null;
  city: string;
  categories: string[];
  status: "active" | "inactive";
  createdAt: string;
  teamCount: number;
  owner: { id: number; name: string; email: string } | null;
};

const statusCfg: Record<string, string> = {
  active: "bg-sage/10 text-sage",
  inactive: "bg-lightstone/60 text-warmgrey",
};

const inputCls = "w-full px-3 py-2 text-sm border border-lightstone rounded-lg focus:outline-none focus:ring-2 focus:ring-terracotta";

// Same +65 normalization as the customer booking form (ServiceDetail.jsx) and
// the provider form in Pro.tsx: strip non-digits, drop a leading 65, cap at 8.
const normalizePhone = (value: string) => {
  const digits = value.replace(/\D/g, '');
  const after65 = digits.startsWith('65') ? digits.slice(2) : digits;
  return '+65' + after65.slice(0, 8);
};

const PHONE_PATTERN = "[+]65[89][0-9]{7}";
const PHONE_TITLE = "Enter a valid Singapore number: +65 followed by 8 digits starting with 8 or 9";

type CatalogCategory = { id: number; name: string };

// Fetches the catalog's top-level category names once — the values stored in
// vendors.categories are matched against offers.category / jobs.category,
// which carry catalog_categories.name.
function useCatalogCategories() {
  const [catalogCategories, setCatalogCategories] = useState<CatalogCategory[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/catalog/categories")
      .then(async (res) => {
        const json = await res.json();
        if (!cancelled && res.ok && Array.isArray(json.data)) setCatalogCategories(json.data);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);
  return { catalogCategories, loaded };
}

// Keeps the mobile field optional while still normalizing to +65…: clearing
// the digits collapses back to empty instead of a bare "+65" the pattern
// would reject.
function mobileFromInput(value: string) {
  const next = normalizePhone(value);
  return next === "+65" ? "" : next;
}

const EMPTY_FORM = {
  name: "", contactEmail: "", mobile: "", city: "",
  ownerName: "", ownerEmail: "", ownerPassword: "",
};

function CategoryPicker({ categories, onAdd, onRemove, catalogCategories, catalogLoaded }: {
  categories: string[];
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
  catalogCategories: CatalogCategory[];
  catalogLoaded: boolean;
}) {
  const options = catalogCategories.filter((c) => !categories.includes(c.name));
  return (
    <div>
      <label className="block text-xs font-semibold text-charcoal mb-1.5">Service categories</label>
      <select
        value=""
        onChange={(e) => { if (e.target.value) onAdd(e.target.value); }}
        disabled={catalogLoaded && options.length === 0}
        className={inputCls}
      >
        <option value="">
          {!catalogLoaded ? "Loading categories..." : options.length === 0 ? "No more categories" : "Add a category"}
        </option>
        {options.map((c) => (
          <option key={c.id} value={c.name}>{c.name}</option>
        ))}
      </select>
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2.5">
          {categories.map((c) => (
            <span key={c} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-accent-50 text-terracotta">
              {c}
              <button type="button" onClick={() => onRemove(c)} className="leading-none hover:text-charcoal">×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function AddVendorModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [categories, setCategories] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const { catalogCategories, loaded: catalogLoaded } = useCatalogCategories();

  const set = (key: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  function addCategory(name: string) {
    if (!name || categories.includes(name)) return;
    setCategories((list) => [...list, name]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await apiFetch("/api/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          contactEmail: form.contactEmail.trim(),
          mobile: form.mobile.trim() || undefined,
          city: form.city.trim(),
          categories,
          owner: {
            name: form.ownerName.trim(),
            email: form.ownerEmail.trim(),
            password: form.ownerPassword,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create vendor.");
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create vendor.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-charcoal/40 p-4 pt-16 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg border border-lightstone">
        <div className="flex items-center justify-between px-6 py-4 border-b border-lightstone">
          <div>
            <h2 className="text-base font-bold text-charcoal">Add a vendor</h2>
            <p className="text-xs text-warmgrey mt-0.5">Onboard a partner company and its owner login.</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-accent-50 rounded-lg transition">
            <X size={16} className="text-warmgrey" />
          </button>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-charcoal mb-1.5">Company name</label>
            <input required value={form.name} onChange={set("name")} placeholder="e.g. Lim & Co Home Services" className={inputCls} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-charcoal mb-1.5">Contact email</label>
              <input required type="email" value={form.contactEmail} onChange={set("contactEmail")} placeholder="hello@company.sg" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-charcoal mb-1.5">Mobile</label>
              <input
                type="tel"
                value={form.mobile}
                onChange={(e) => setForm((f) => ({ ...f, mobile: mobileFromInput(e.target.value) }))}
                pattern={PHONE_PATTERN}
                title={PHONE_TITLE}
                placeholder="+65 8123 4567"
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-charcoal mb-1.5">City</label>
            <input required value={form.city} onChange={set("city")} placeholder="Singapore" className={inputCls} />
          </div>

          <CategoryPicker
            categories={categories}
            onAdd={addCategory}
            onRemove={(name) => setCategories((list) => list.filter((x) => x !== name))}
            catalogCategories={catalogCategories}
            catalogLoaded={catalogLoaded}
          />

          <div className="pt-2 border-t border-lightstone">
            <p className="text-xs font-bold text-charcoal uppercase tracking-wide mb-3">Owner login</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-charcoal mb-1.5">Owner name</label>
                <input required value={form.ownerName} onChange={set("ownerName")} placeholder="e.g. Daniel Lim" className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-charcoal mb-1.5">Owner email</label>
                  <input required type="email" value={form.ownerEmail} onChange={set("ownerEmail")} placeholder="owner@company.sg" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-charcoal mb-1.5">Temporary password</label>
                  <input required minLength={8} type="password" value={form.ownerPassword} onChange={set("ownerPassword")} placeholder="At least 8 characters" className={inputCls} />
                </div>
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-rosewood">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-warmgrey bg-accent-50 hover:bg-lightstone rounded-lg transition">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-terracotta hover:bg-accent-700 rounded-lg transition disabled:opacity-60"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              Add vendor
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditVendorModal({ vendor, onClose, onSaved }: { vendor: Vendor; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: vendor.name,
    contactEmail: vendor.contactEmail,
    mobile: vendor.mobile || "",
    city: vendor.city,
  });
  const [categories, setCategories] = useState<string[]>(vendor.categories);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const { catalogCategories, loaded: catalogLoaded } = useCatalogCategories();

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  function addCategory(name: string) {
    if (!name || categories.includes(name)) return;
    setCategories((list) => [...list, name]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await apiFetch(`/api/vendors/${vendor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          contactEmail: form.contactEmail.trim(),
          mobile: form.mobile.trim() || null,
          city: form.city.trim(),
          categories,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update vendor.");
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update vendor.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-charcoal/40 p-4 pt-16 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg border border-lightstone">
        <div className="flex items-center justify-between px-6 py-4 border-b border-lightstone">
          <div>
            <h2 className="text-base font-bold text-charcoal">Edit vendor</h2>
            <p className="text-xs text-warmgrey mt-0.5">Update {vendor.name}'s details and service categories.</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-accent-50 rounded-lg transition">
            <X size={16} className="text-warmgrey" />
          </button>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-charcoal mb-1.5">Company name</label>
            <input required value={form.name} onChange={set("name")} className={inputCls} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-charcoal mb-1.5">Contact email</label>
              <input required type="email" value={form.contactEmail} onChange={set("contactEmail")} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-charcoal mb-1.5">Mobile</label>
              <input
                type="tel"
                value={form.mobile}
                onChange={(e) => setForm((f) => ({ ...f, mobile: mobileFromInput(e.target.value) }))}
                pattern={form.mobile === (vendor.mobile || "") ? undefined : PHONE_PATTERN}
                title={PHONE_TITLE}
                placeholder="+65 8123 4567"
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-charcoal mb-1.5">City</label>
            <input required value={form.city} onChange={set("city")} className={inputCls} />
          </div>

          <CategoryPicker
            categories={categories}
            onAdd={addCategory}
            onRemove={(name) => setCategories((list) => list.filter((x) => x !== name))}
            catalogCategories={catalogCategories}
            catalogLoaded={catalogLoaded}
          />

          {error && <p className="text-sm text-rosewood">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-warmgrey bg-accent-50 hover:bg-lightstone rounded-lg transition">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-terracotta hover:bg-accent-700 rounded-lg transition disabled:opacity-60"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              Save changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function VendorsPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/vendors");
      const json = await res.json();
      if (res.ok && Array.isArray(json.data)) {
        setVendors(json.data);
      } else if (res.status === 401) {
        setError("Session expired or missing. Signing out…");
        await logout();
        navigate("/login");
      } else {
        setError(json.error || "Failed to load vendors.");
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
  }, []);

  async function toggleStatus(vendor: Vendor) {
    const nextStatus = vendor.status === "active" ? "inactive" : "active";
    setBusyId(vendor.id);
    try {
      const res = await apiFetch(`/api/vendors/${vendor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update vendor.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update vendor.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5 pb-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-charcoal">Vendors</h1>
          <p className="text-sm text-warmgrey mt-0.5">Onboard partner companies and manage their platform access.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-terracotta hover:bg-accent-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
        >
          <Plus size={15} />
          Add vendor
        </button>
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
        ) : vendors.length === 0 ? (
          <div className="text-center py-16">
            <Building2 size={32} className="text-lightstone mx-auto mb-3" />
            <p className="text-sm text-warmgrey">No vendors yet. Add the first one.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-lightstone">
                  {["Company", "Categories", "City", "Owner", "Team", "Status", "Joined", ""].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-warmgrey uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-lightstone/50">
                {vendors.map((v) => (
                  <tr key={v.id} className="hover:bg-accent-50/70 transition">
                    <td className="px-4 py-3 font-semibold text-charcoal whitespace-nowrap">{v.name}</td>
                    <td className="px-4 py-3 text-warmgrey max-w-xs truncate">{v.categories.join(", ") || "—"}</td>
                    <td className="px-4 py-3 text-warmgrey whitespace-nowrap">{v.city}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {v.owner ? (
                        <div>
                          <p className="text-charcoal font-medium">{v.owner.name}</p>
                          <p className="text-xs text-warmgrey">{v.owner.email}</p>
                        </div>
                      ) : (
                        <span className="text-warmgrey">No login yet</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-warmgrey whitespace-nowrap">{v.teamCount}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={clsx("inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-semibold capitalize", statusCfg[v.status])}>
                        {v.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-warmgrey whitespace-nowrap">{new Date(v.createdAt).toLocaleDateString("en-SG")}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => setEditingVendor(v)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-charcoal bg-accent-50 hover:bg-lightstone rounded-lg transition"
                        >
                          <Pencil size={12} /> Edit
                        </button>
                        <button
                          onClick={() => toggleStatus(v)}
                          disabled={busyId === v.id}
                          className={clsx(
                            "px-2.5 py-1 text-xs font-semibold rounded-lg transition disabled:opacity-60",
                            v.status === "active" ? "text-rosewood bg-dustyrose/10 hover:bg-dustyrose/20" : "text-sage bg-sage/10 hover:bg-sage/20"
                          )}
                        >
                          {v.status === "active" ? "Suspend" : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && <AddVendorModal onClose={() => setShowModal(false)} onCreated={load} />}
      {editingVendor && (
        <EditVendorModal vendor={editingVendor} onClose={() => setEditingVendor(null)} onSaved={load} />
      )}
    </div>
  );
}
