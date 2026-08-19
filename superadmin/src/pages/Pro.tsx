import React, { useEffect, useState } from "react";
import { Plus, Search, Star, X, Wrench } from "lucide-react";
import clsx from "clsx";
import ModalPortal from "@/components/ModalPortal";
import { apiFetch } from "@/lib/api";

type Provider = {
  id: number;
  name: string;
  email: string;
  mobile: string;
  services: string[];
  city: string;
  status: string;
  rating: number;
  total_jobs: number;
  avatar: string | null;
  joined?: string;
};

type Service = { id: number; name: string };
type City = { id: number; cityName: string };

const statusCfg: Record<string, { cls: string; dot: string }> = {
  active: { cls: "bg-sage/10 text-sage ring-1 ring-sage/20", dot: "bg-sage" },
  busy: { cls: "bg-accent-100 text-accent-700 ring-1 ring-terracotta/20", dot: "bg-terracotta" },
  inactive: { cls: "bg-dustyrose/10 text-rosewood ring-1 ring-dustyrose/20", dot: "bg-dustyrose" },
};

const defaultForm = {
  name: "",
  email: "",
  mobile: "",
  password: "",
  services: [] as string[],
  city: "",
  status: "active",
};

export default function ProPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [availableServices, setAvailableServices] = useState<Service[]>([]);
  const [availableCities, setAvailableCities] = useState<City[]>([]);

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchProviders();
    fetchServices();
    fetchCities();
  }, []);

  async function fetchProviders() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/service-providers");
      const json = await res.json();
      if (res.ok && Array.isArray(json.data)) {
        setProviders(json.data);
      } else {
        setError(json.error || "Failed to load providers.");
      }
    } catch (err) {
      setError("Failed to connect to server.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchServices() {
    try {
      const res = await apiFetch("/api/services");
      const json = await res.json();
      if (json.data) setAvailableServices(json.data);
    } catch (err) {
      console.error("Failed to fetch services", err);
    }
  }

  async function fetchCities() {
    try {
      const res = await apiFetch("/api/cities");
      const json = await res.json();
      if (json.data) setAvailableCities(json.data);
    } catch (err) {
      console.error("Failed to fetch cities", err);
    }
  }

  function getInitials(name: string) {
    return (name || "?").trim().split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  }

  function toggleService(serviceName: string) {
    setForm((prev) => ({
      ...prev,
      services: prev.services.includes(serviceName)
        ? prev.services.filter((s) => s !== serviceName)
        : [...prev.services, serviceName],
    }));
  }

  function validate() {
    if (!form.name.trim()) return "Name is required.";
    if (!form.email.trim()) return "Email is required.";
    if (!form.mobile.trim()) return "Mobile is required.";
    if (form.services.length === 0) return "At least one service is required.";
    if (!form.city.trim()) return "City is required.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validation = validate();
    if (validation) {
      setFormError(validation);
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const res = await apiFetch("/api/service-providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          mobile: form.mobile.trim(),
          password: form.password.trim() || undefined,
          services: form.services,
          city: form.city.trim(),
          status: form.status,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to add provider.");
      }

      await fetchProviders();
      setShowModal(false);
      setForm(defaultForm);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to add provider.");
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    setShowModal(false);
    setForm(defaultForm);
    setFormError(null);
  }

  const filtered = providers.filter((p) => {
    const q = search.toLowerCase();
    return (
      (p.name || "").toLowerCase().includes(q) ||
      (p.mobile || "").includes(q) ||
      (p.city || "").toLowerCase().includes(q) ||
      (p.email || "").toLowerCase().includes(q)
    );
  });

  const inputCls =
    "w-full px-3 py-2 text-sm bg-gray-50 border border-lightstone rounded-xl focus:outline-none focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta transition placeholder:text-warmgrey";

  return (
    <div className="space-y-5 pb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-charcoal">Service Providers</h1>
          <p className="text-sm text-warmgrey mt-0.5">Manage professionals and their services</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-warmgrey" />
            <input
              type="text"
              placeholder="Search providers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-4 py-2 text-sm bg-white border border-lightstone rounded-xl focus:outline-none focus:ring-2 focus:ring-terracotta/30 w-64 transition"
            />
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold bg-terracotta hover:bg-accent-700 text-white px-4 py-2 rounded-xl transition shadow-sm shadow-soft"
          >
            <Plus size={14} /> Add Provider
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-lightstone shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <div className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full bg-terracotta animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
              <p className="text-sm text-warmgrey">Loading providers...</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16">
            <p className="text-sm text-rosewood">{error}</p>
            <button
              onClick={fetchProviders}
              className="mt-2 text-sm text-terracotta font-medium hover:underline"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-lightstone">
                  {["Provider", "Mobile", "City", "Rating", "Jobs", "Status", ""].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-[11px] font-semibold text-warmgrey uppercase tracking-wide whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-lightstone/50">
                {filtered.map((provider) => {
                  const st = statusCfg[provider.status] ?? statusCfg.inactive;
                  return (
                    <tr key={provider.id} className="hover:bg-accent-50/70 transition">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-terracotta/10 flex items-center justify-center text-terracotta font-bold text-[11px] shrink-0">
                            {getInitials(provider.name)}
                          </div>
                          <div>
                            <p className="font-semibold text-charcoal leading-tight">{provider.name}</p>
                            <p className="text-[11px] text-warmgrey leading-tight">{provider.email || "—"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-warmgrey whitespace-nowrap">{provider.mobile || "—"}</td>
                      <td className="px-4 py-3 text-warmgrey whitespace-nowrap">{provider.city || "—"}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1 text-charcoal font-semibold">
                          <Star size={13} className="text-yellow-500 fill-yellow-500" />
                          {Number(provider.rating || 0).toFixed(2)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-charcoal font-semibold whitespace-nowrap">
                        {Number(provider.total_jobs || 0)} jobs
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={clsx(
                            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[11px] font-semibold",
                            st.cls
                          )}
                        >
                          <span className={clsx("w-1.5 h-1.5 rounded-full", st.dot)} />
                          {provider.status || "inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <span className="text-warmgrey text-[11px]">
                          {Array.isArray(provider.services) && provider.services.length > 0
                            ? `${provider.services.length} service${provider.services.length > 1 ? "s" : ""}`
                            : "—"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && !loading && (
              <div className="text-center py-16">
                <Wrench size={32} className="text-lightstone mx-auto mb-3" />
                <p className="text-sm text-warmgrey">No service providers found.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {showModal && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/20">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 border border-lightstone overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-lightstone">
                <div>
                  <h2 className="text-base font-bold text-charcoal">Add Service Provider</h2>
                  <p className="text-xs text-warmgrey mt-0.5">Fill in the details below</p>
                </div>
                <button onClick={handleClose} className="p-1.5 hover:bg-accent-50 rounded-lg transition">
                  <X size={16} className="text-warmgrey" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-warmgrey mb-1.5">Full Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Siti A."
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-warmgrey mb-1.5">Email *</label>
                  <input
                    type="email"
                    placeholder="e.g. provider@kynd.sg"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-warmgrey mb-1.5">Mobile *</label>
                  <input
                    type="text"
                    placeholder="e.g. +6581234567"
                    value={form.mobile}
                    onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-warmgrey mb-1.5">Password</label>
                  <input
                    type="password"
                    placeholder="Optional password for provider login"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-warmgrey mb-1.5">Services *</label>
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) toggleService(e.target.value);
                    }}
                    disabled={availableServices.length === 0}
                    className={inputCls}
                  >
                    <option value="">
                      {availableServices.length === 0 ? "Loading services..." : "Add a service"}
                    </option>
                    {availableServices
                      .filter((service) => !form.services.includes(service.name))
                      .map((service) => (
                        <option key={service.id} value={service.name}>
                          {service.name}
                        </option>
                      ))}
                  </select>
                  {form.services.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {form.services.map((name) => (
                        <span
                          key={name}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-terracotta/10 text-terracotta"
                        >
                          {name}
                          <button
                            type="button"
                            onClick={() => toggleService(name)}
                            aria-label={`Remove ${name}`}
                            className="text-terracotta hover:text-charcoal leading-none"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-warmgrey mb-1.5">City *</label>
                  <select
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    className={inputCls}
                  >
                    <option value="">Select city</option>
                    {availableCities.length === 0 ? (
                      <option value="">Loading cities...</option>
                    ) : (
                      availableCities.map((city) => (
                        <option key={city.id} value={city.cityName}>
                          {city.cityName}
                        </option>
                      ))
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-warmgrey mb-1.5">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className={inputCls}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="busy">Busy</option>
                  </select>
                </div>
                {formError && <p className="text-xs text-rosewood">{formError}</p>}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="flex-1 px-4 py-2.5 text-sm font-semibold bg-warmlinen text-charcoal rounded-xl hover:bg-lightstone transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 px-4 py-2.5 text-sm font-semibold bg-terracotta hover:bg-accent-700 text-white rounded-xl transition disabled:opacity-60"
                  >
                    {saving ? "Adding..." : "Add Provider"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}
