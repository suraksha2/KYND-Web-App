import { useEffect, useState } from "react";
import { X, Plus, Trash2 } from "lucide-react";
import clsx from "clsx";
import ModalPortal from "@/components/ModalPortal";
import { apiFetch } from "@/lib/api";
import { CityRecord, CreateCityInput } from "@/lib/types";

interface AreaPincode {
  areaName: string;
  pinCode: string;
}

type CityFormState = CreateCityInput & { serviceCategoryId?: string };

const EMPTY_FORM: CityFormState = {
  cityName: "",
  pinCode: "",
  serviceCategoryId: "",
};

// Parse serviceCategoryId which may be a JSON array of ids, a single id, or empty.
function parseCategoryIds(value?: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map((v) => String(v));
  } catch {
    // not JSON; treat as a single id
  }
  return [String(value)];
}

interface Props {
  open: boolean;
  city?: CityRecord | null;
  onClose: () => void;
  onSave: (data: CreateCityInput) => Promise<void>;
}

export default function CityFormModal({ open, city, onClose, onSave }: Props) {
  const [form, setForm] = useState<CityFormState>(EMPTY_FORM);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [areas, setAreas] = useState<AreaPincode[]>([]);
  const [newArea, setNewArea] = useState({ areaName: "", pinCode: "" });
  
  useEffect(() => {
    apiFetch("/api/service-categories")
      .then((res) => res.json())
      .then((data) => {
        if (data?.data) setCategories(data.data);
      });
  }, []);
  
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof CreateCityInput, string>>>({});

  useEffect(() => {
    if (city) {
      setForm({ 
        cityName: city.cityName, 
        pinCode: city.pinCode, 
        serviceCategoryId: city.serviceCategoryId ? String(city.serviceCategoryId) : "" 
      });
      setSelectedCategoryIds(parseCategoryIds(city.serviceCategoryId));
      try {
        const parsed = JSON.parse(city.pinCode);
        if (Array.isArray(parsed)) {
          setAreas(parsed);
        } else {
          setAreas([{ areaName: "Default", pinCode: city.pinCode }]);
        }
      } catch {
        setAreas([{ areaName: "Default", pinCode: city.pinCode }]);
      }
    } else {
      setForm(EMPTY_FORM);
      setAreas([]);
      setSelectedCategoryIds([]);
    }
    setErrors({});
  }, [city, open]);

  function toggleCategory(id: string) {
    setSelectedCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  }

  function validate() {
    const nextErrors: Partial<Record<keyof CreateCityInput, string>> = {};
    if (!form.cityName.trim()) {
      nextErrors.cityName = "City name is required.";
    }
    if (areas.length === 0) {
      nextErrors.pinCode = "At least one area/pincode is required.";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function addArea() {
    if (newArea.areaName.trim() && newArea.pinCode.trim()) {
      setAreas([...areas, { ...newArea }]);
      setNewArea({ areaName: "", pinCode: "" });
    }
  }

  function removeArea(index: number) {
    setAreas(areas.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validate()) {
      return;
    }

    setSaving(true);
    try {
      const pinCodeJson = JSON.stringify(areas);
      await onSave({
        cityName: form.cityName.trim(),
        pinCode: pinCodeJson,
        serviceCategoryId: selectedCategoryIds.length > 0 ? JSON.stringify(selectedCategoryIds) : "",
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return null;
  }

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-2xl bg-white shadow-xl border border-lightstone overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-lightstone">
          <div>
            <h2 className="text-base font-bold text-charcoal">{city ? "Edit City" : "Add City"}</h2>
            <p className="text-xs text-warmgrey mt-0.5">City details and service areas</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-accent-50 rounded-lg transition"
          >
            <X size={16} className="text-warmgrey" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-warmgrey mb-1.5">City Name <span className="text-rosewood">*</span></label>
            <input
              value={form.cityName}
              onChange={(e) => {
                setForm((prev) => ({ ...prev, cityName: e.target.value }));
                if (errors.cityName) {
                  setErrors((prev) => ({ ...prev, cityName: undefined }));
                }
              }}
              className={clsx(
                "w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta transition-all",
                errors.cityName ? "border-dustyrose" : "border-lightstone"
              )}
              placeholder="Enter city name"
            />
            {errors.cityName && <p className="mt-1 text-xs text-rosewood">{errors.cityName}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-warmgrey mb-1.5">Areas & Pincodes <span className="text-rosewood">*</span></label>

            <div className="space-y-2 mb-3">
              {areas.map((area, index) => (
                <div key={index} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-charcoal">{area.areaName}</p>
                    <p className="text-xs text-warmgrey">{area.pinCode}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeArea(index)}
                    className="p-1 text-rosewood hover:bg-dustyrose/10 rounded transition"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              {areas.length === 0 && (
                <p className="text-sm text-warmgrey italic">No areas added yet</p>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={newArea.areaName}
                onChange={(e) => setNewArea({ ...newArea, areaName: e.target.value })}
                className="flex-1 rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta transition-all border-lightstone"
                placeholder="Area name (e.g., Indiranagar)"
              />
              <input
                value={newArea.pinCode}
                onChange={(e) => setNewArea({ ...newArea, pinCode: e.target.value })}
                className="w-full sm:w-28 rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta transition-all border-lightstone"
                placeholder="Pincode"
              />
              <button
                type="button"
                onClick={addArea}
                className="px-3 py-2 bg-terracotta text-white rounded-xl hover:bg-accent-700 transition shadow-sm shrink-0"
              >
                <Plus size={16} />
              </button>
            </div>
            {errors.pinCode && <p className="mt-1 text-xs text-rosewood">{errors.pinCode}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-warmgrey mb-1.5">
              Services{selectedCategoryIds.length > 0 && (
                <span className="ml-1 text-warmgrey font-normal">({selectedCategoryIds.length} selected)</span>
              )}
            </label>
            {categories.length === 0 ? (
              <p className="text-sm text-warmgrey italic">No service categories available</p>
            ) : (
              <div className="max-h-40 overflow-y-auto rounded-xl border border-lightstone p-2 space-y-1">
                {categories.map((cat) => {
                  const checked = selectedCategoryIds.includes(String(cat.id));
                  return (
                    <label
                      key={cat.id}
                      className={clsx(
                        "flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition",
                        checked ? "bg-accent-50" : "hover:bg-accent-50"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCategory(String(cat.id))}
                        className="h-4 w-4 rounded border-lightstone text-terracotta focus:ring-terracotta"
                      />
                      <span className="text-sm text-warmgrey">{cat.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
            <p className="mt-1 text-xs text-warmgrey">Select one or more services for this city.</p>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-warmgrey bg-accent-50 hover:bg-lightstone rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-sm font-bold bg-terracotta hover:bg-accent-700 text-white rounded-xl shadow-sm shadow-soft transition disabled:opacity-60"
            >
              {saving ? "Saving..." : "Submit"}
            </button>
          </div>
        </form>
      </div>
    </div>
    </ModalPortal>
  );
}
