import { useEffect, useState } from "react";
import { X, Plus, Trash2, Pencil, MapPin } from "lucide-react";
import clsx from "clsx";
import ModalPortal from "@/components/ModalPortal";
import { apiFetch } from "@/lib/api";
import { CityArea, CityRecord } from "@/lib/types";

interface AreaFormState {
  areaName: string;
  pincode: string;
  status: "active" | "inactive";
}

const EMPTY_FORM: AreaFormState = {
  areaName: "",
  pincode: "",
  status: "active",
};

interface Props {
  open: boolean;
  city: CityRecord | null;
  onClose: () => void;
  onChanged?: () => void;
}

export default function AreasManagementModal({ open, city, onClose, onChanged }: Props) {
  const [areas, setAreas] = useState<CityArea[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<AreaFormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && city) {
      fetchAreas();
    }
  }, [open, city]);

  const fetchAreas = async () => {
    if (!city) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/city-areas?city_id=${city.id}`);
      if (!res.ok) throw new Error("Failed to fetch areas.");
      const json = await res.json();
      setAreas(json.data || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  function validate() {
    if (!form.areaName.trim()) {
      setError("Area name is required.");
      return false;
    }
    return true;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validate() || !city) return;

    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        const res = await apiFetch(`/api/city-areas/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            areaName: form.areaName.trim(),
            pincode: form.pincode.trim() || undefined,
            status: form.status,
          }),
        });
        if (!res.ok) {
          const json = await res.json();
          throw new Error(json.error || "Failed to update area.");
        }
      } else {
        const res = await apiFetch("/api/city-areas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cityId: city.id,
            areaName: form.areaName.trim(),
            pincode: form.pincode.trim() || undefined,
            status: form.status,
          }),
        });
        if (!res.ok) {
          const json = await res.json();
          throw new Error(json.error || "Failed to create area.");
        }
      }
      setForm(EMPTY_FORM);
      setEditingId(null);
      await fetchAreas();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(area: CityArea) {
    setForm({
      areaName: area.areaName,
      pincode: area.pincode || "",
      status: area.status,
    });
    setEditingId(area.id);
  }

  function cancelEdit() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setError(null);
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this area?")) return;
    
    setDeletingId(id);
    try {
      const res = await apiFetch(`/api/city-areas/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete area.");
      await fetchAreas();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setDeletingId(null);
    }
  }

  if (!open || !city) {
    return null;
  }

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl border border-lightstone overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-lightstone shrink-0">
          <div>
            <h2 className="text-base font-bold text-charcoal">Manage Areas - {city.cityName}</h2>
            <p className="text-xs text-warmgrey mt-0.5">
              {areas.length} area{areas.length !== 1 ? "s" : ""} configured
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-accent-50 rounded-lg transition"
          >
            <X size={16} className="text-warmgrey" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && (
            <div className="mb-4 px-4 py-3 bg-dustyrose/10 text-rosewood text-sm rounded-lg border border-dustyrose/20">
              {error}
            </div>
          )}

          {/* Add/Edit Form */}
          <form onSubmit={handleSubmit} className="mb-6 p-4 bg-gray-50 rounded-2xl border border-lightstone">
            <div className="flex items-center gap-2 mb-3">
              <MapPin size={18} className="text-terracotta" />
              <h3 className="text-sm font-semibold text-warmgrey">
                {editingId ? "Edit Area" : "Add New Area"}
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-1">
                <input
                  value={form.areaName}
                  onChange={(e) => setForm({ ...form, areaName: e.target.value })}
                  className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta transition-all border-lightstone"
                  placeholder="Area name (e.g., Indiranagar)"
                />
              </div>
              <div className="sm:col-span-1">
                <input
                  value={form.pincode}
                  onChange={(e) => setForm({ ...form, pincode: e.target.value })}
                  className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta transition-all border-lightstone"
                  placeholder="Pincode (optional)"
                />
              </div>
              <div className="sm:col-span-1">
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as "active" | "inactive" })}
                  className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta transition-all border-lightstone"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 sm:flex-none px-4 py-2 text-sm font-semibold bg-terracotta hover:bg-accent-700 text-white rounded-xl shadow-sm transition disabled:opacity-60"
              >
                {saving ? "Saving..." : editingId ? "Update" : "Add Area"}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="px-4 py-2 text-sm font-semibold text-warmgrey hover:bg-accent-50 rounded-xl transition"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>

          {/* Areas List */}
          {loading ? (
            <div className="flex items-center justify-center py-8 text-warmgrey text-sm">
              Loading areas...
            </div>
          ) : areas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-warmgrey gap-2">
              <MapPin size={32} className="opacity-40" />
              <p className="text-sm">No areas configured yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {areas.map((area) => (
                <div
                  key={area.id}
                  className={clsx(
                    "flex items-center justify-between p-3 rounded-xl border transition",
                    area.status === "active"
                      ? "bg-white border-lightstone hover:border-indigo-200"
                      : "bg-gray-50 border-lightstone opacity-70"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={clsx(
                      "w-8 h-8 rounded-full flex items-center justify-center",
                      area.status === "active" ? "bg-accent-100 text-terracotta" : "bg-lightstone text-warmgrey"
                    )}>
                      <MapPin size={16} />
                    </div>
                    <div>
                      <p className="font-medium text-charcoal">{area.areaName}</p>
                      {area.pincode && (
                        <p className="text-xs text-warmgrey">{area.pincode}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={clsx(
                        "px-2 py-1 text-xs font-semibold rounded-full",
                        area.status === "active"
                          ? "bg-sage/10 text-sage"
                          : "bg-lightstone text-warmgrey"
                      )}
                    >
                      {area.status}
                    </span>
                    <button
                      onClick={() => startEdit(area)}
                      className="p-1.5 text-terracotta hover:bg-accent-100 rounded-lg transition"
                      title="Edit"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(area.id)}
                      disabled={deletingId === area.id}
                      className="p-1.5 text-rosewood hover:bg-dustyrose/10 rounded-lg transition disabled:opacity-50"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
