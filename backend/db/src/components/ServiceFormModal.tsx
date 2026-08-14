"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import clsx from "clsx";
import ModalPortal from "@/components/ModalPortal";
import {
  CityRecord,
  CityService,
  CreateCityServiceInput,
  ServiceCategory,
} from "@/lib/types";

const CATEGORIES: ServiceCategory[] = [
  "Water & Sanitation",
  "Transportation",
  "Electricity",
  "Healthcare",
  "Education",
  "Waste Management",
  "Public Safety",
  "Parks & Recreation",
];

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function createEmptyForm(): CreateCityServiceInput {
  return {
    cityId: "",
    name: "",
    category: "Water & Sanitation",
    description: "",
    status: "Pending",
    provider: "",
    contactEmail: "",
    contactPhone: "",
    budget: 0,
    startDate: getTodayDate(),
    endDate: null,
  };
}

interface Props {
  open: boolean;
  service?: CityService | null;
  cities: CityRecord[];
  citiesLoading?: boolean;
  onClose: () => void;
  onSave: (data: CreateCityServiceInput) => Promise<void>;
}

export default function ServiceFormModal({ open, service, cities, citiesLoading = false, onClose, onSave }: Props) {
  const [form, setForm] = useState<CreateCityServiceInput>(createEmptyForm);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof CreateCityServiceInput, string>>>({});

  useEffect(() => {
    if (service) {
      const { id, createdAt, updatedAt, ...rest } = service;
      void id; void createdAt; void updatedAt;
      setForm(rest);
    } else {
      setForm(createEmptyForm());
    }
    setErrors({});
  }, [service, open]);

  function validate(): boolean {
    const newErrors: typeof errors = {};
    if (!form.cityId?.trim()) newErrors.cityId = "City is required.";
    if (!form.name.trim()) newErrors.name = "Name is required.";
    if (!form.description.trim()) newErrors.description = "Description is required.";
    if (!form.provider.trim()) newErrors.provider = "Provider is required.";
    if (!form.contactEmail.trim()) newErrors.contactEmail = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail))
      newErrors.contactEmail = "Enter a valid email.";
    if (!form.contactPhone.trim()) newErrors.contactPhone = "Phone is required.";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      await onSave({
        ...form,
        status: form.status || "Pending",
        budget: Number.isFinite(form.budget) ? form.budget : 0,
        startDate: form.startDate || getTodayDate(),
        endDate: form.endDate || null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  function field(key: keyof CreateCityServiceInput) {
    return {
      value: form[key] ?? "",
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const val = key === "budget" ? Number(e.target.value) : e.target.value || (key === "endDate" ? null : e.target.value);
        setForm((prev) => ({ ...prev, [key]: val }));
        if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
      },
    };
  }

  if (!open) return null;

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[92vh] flex flex-col border border-lightstone overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-lightstone">
          <div>
            <h2 className="text-base font-bold text-charcoal">
              {service ? "Edit City Service" : "Add City Service"}
            </h2>
            <p className="text-xs text-warmgrey mt-0.5">City service details</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-accent-50 rounded-lg transition"
            title="Close"
          >
            <X size={16} className="text-warmgrey" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-warmgrey mb-1.5">City <span className="text-rosewood">*</span></label>
            <select
              className={clsx(
                "w-full border rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta transition-all border-lightstone",
                errors.cityId ? "border-dustyrose" : "border-lightstone"
              )}
              value={form.cityId ?? ""}
              onChange={(e) => {
                setForm((prev) => ({ ...prev, cityId: e.target.value }));
                if (errors.cityId) setErrors((prev) => ({ ...prev, cityId: undefined }));
              }}
            >
              <option value="">{citiesLoading ? "Loading cities..." : "Select a city"}</option>
              {cities.map((city) => (
                <option key={city.id} value={city.id}>
                  {city.cityName} ({city.pinCode})
                </option>
              ))}
            </select>
            {errors.cityId && <p className="text-xs text-rosewood mt-1">{errors.cityId}</p>}
          </div>

          {/* Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-warmgrey mb-1.5">Service Name <span className="text-rosewood">*</span></label>
              <input
                className={clsx(
                  "w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta transition-all border-lightstone",
                  errors.name ? "border-dustyrose" : "border-lightstone"
                )}
                placeholder="e.g. Clean Water Supply"
                {...field("name")}
              />
              {errors.name && <p className="text-xs text-rosewood mt-1">{errors.name}</p>}
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-semibold text-warmgrey mb-1.5">Category <span className="text-rosewood">*</span></label>
              <select
                className="w-full border border-lightstone rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta transition-all border-lightstone"
                {...field("category")}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            {/* Status Dropdown */}
            <div>
              <label className="block text-xs font-semibold text-warmgrey mb-1.5">Status <span className="text-rosewood">*</span></label>
              <select
                className="w-full border border-lightstone rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta transition-all border-lightstone"
                {...field("status")}
              >
                <option value="Active">Active</option>
                <option value="Pending">Pending</option>
                <option value="Suspended">Suspended</option>
                <option value="Completed">Completed</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-warmgrey mb-1.5">Description <span className="text-rosewood">*</span></label>
            <textarea
              rows={3}
              className={clsx(
                "w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta transition-all resize-none border-lightstone",
                errors.description ? "border-dustyrose" : "border-lightstone"
              )}
              placeholder="Describe the city service..."
              {...field("description")}
            />
            {errors.description && <p className="text-xs text-rosewood mt-1">{errors.description}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Provider */}
            <div>
              <label className="block text-xs font-semibold text-warmgrey mb-1.5">Provider <span className="text-rosewood">*</span></label>
              <input
                className={clsx(
                  "w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta transition-all border-lightstone",
                  errors.provider ? "border-dustyrose" : "border-lightstone"
                )}
                placeholder="Provider name"
                {...field("provider")}
              />
              {errors.provider && <p className="text-xs text-rosewood mt-1">{errors.provider}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Contact Email */}
            <div>
              <label className="block text-xs font-semibold text-warmgrey mb-1.5">Contact Email <span className="text-rosewood">*</span></label>
              <input
                type="email"
                className={clsx(
                  "w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta transition-all border-lightstone",
                  errors.contactEmail ? "border-dustyrose" : "border-lightstone"
                )}
                placeholder="contact@city.gov"
                {...field("contactEmail")}
              />
              {errors.contactEmail && <p className="text-xs text-rosewood mt-1">{errors.contactEmail}</p>}
            </div>

            {/* Contact Phone */}
            <div>
              <label className="block text-xs font-semibold text-warmgrey mb-1.5">Contact Phone <span className="text-rosewood">*</span></label>
              <input
                type="tel"
                className={clsx(
                  "w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta transition-all border-lightstone",
                  errors.contactPhone ? "border-dustyrose" : "border-lightstone"
                )}
                placeholder="+1-800-555-0000"
                {...field("contactPhone")}
              />
              {errors.contactPhone && <p className="text-xs text-rosewood mt-1">{errors.contactPhone}</p>}
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-lightstone">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-warmgrey bg-accent-50 hover:bg-lightstone rounded-xl transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-5 py-2 text-sm font-bold bg-terracotta hover:bg-accent-700 text-white rounded-xl shadow-sm shadow-soft transition disabled:opacity-60"
          >
            {saving ? "Saving…" : service ? "Update Service" : "Add Service"}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
