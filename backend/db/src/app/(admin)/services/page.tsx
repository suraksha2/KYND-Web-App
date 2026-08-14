"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Search, Pencil, Trash2, X, Wrench, Tag, DollarSign, CheckCircle, AlertCircle, Package } from "lucide-react";
import clsx from "clsx";
import { ServiceCategory } from "@/lib/service-category-types";
import ModalPortal from "@/components/ModalPortal";

type Service = {
  id: number;
  name: string;
  category: string;
  price: string;
  availability: string;
  status: "Available" | "Busy" | "Offline";
  icon: string;
  image: string | null;
};

const statusCfg: Record<Service["status"], { cls: string; dot: string }> = {
  Available: { cls: "bg-sage/10 text-sage ring-1 ring-sage/20", dot: "bg-sage" },
  Busy:      { cls: "bg-accent-100 text-accent-700 ring-1 ring-terracotta/20",       dot: "bg-terracotta"  },
  Offline:   { cls: "bg-dustyrose/10 text-rosewood ring-1 ring-dustyrose/20",             dot: "bg-dustyrose"    },
};

const catColors = [
  "bg-terracotta","bg-sage","bg-terracotta","bg-dustyrose","bg-terracotta","bg-terracotta","bg-sage","bg-terracotta",
];

const defaultCategoryForm = {
  name: "",
  description: "",
};

function imageLabel(src: string) {
  return src
    .replace("/images/", "")
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c: string) => c.toUpperCase());
}

const defaultServiceForm = {
  name: "",
  category: "",
  price: "",
  availability: "",
  status: "Available" as Service["status"],
  icon: "",
  image: "",
};

export default function ServicesPage() {
  const [search, setSearch] = useState("");
  const [services, setServices] = useState<Service[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);

  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  const [availableImages, setAvailableImages] = useState<string[]>([]);

  useEffect(() => {
    fetchServices();
  }, []);

  useEffect(() => {
    fetch("/api/images")
      .then((res) => res.json())
      .then((json) => setAvailableImages(json.data ?? []))
      .catch((err) => console.error("Failed to fetch images", err));
  }, []);

  async function fetchServices() {
    try {
      const res = await fetch("/api/services");
      const json = await res.json();
      if (json.data) {
        const mappedServices = json.data.map((service: any) => ({
          id: service.id,
          name: service.name,
          category: service.category,
          price: `S$${service.price}`,
          availability: service.availability,
          status: service.status,
          icon: service.name.substring(0, 2).toUpperCase(),
          image: service.image || null,
        }));
        setServices(mappedServices);
      }
    } catch (err) {
      console.error("Failed to fetch services", err);
    } finally {
      setServicesLoading(false);
    }
  }

  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ServiceCategory | null>(null);
  const [categoryForm, setCategoryForm] = useState(defaultCategoryForm);
  const [categoryFormError, setCategoryFormError] = useState<string | null>(null);
  const [savingCategory, setSavingCategory] = useState(false);

  const [deleteCategoryId, setDeleteCategoryId] = useState<string | null>(null);
  const [deletingCategory, setDeletingCategory] = useState(false);

  const [showServiceModal, setShowServiceModal] = useState(false);
  const [serviceForm, setServiceForm] = useState(defaultServiceForm);
  const [serviceFormError, setServiceFormError] = useState<string | null>(null);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [deleteServiceId, setDeleteServiceId] = useState<number | null>(null);
  const [deletingService, setDeletingService] = useState(false);

  const fetchCategories = useCallback(async () => {
    setCategoriesLoading(true);
    setCategoryError(null);

    try {
      const res = await fetch("/api/service-categories");
      if (!res.ok) {
        throw new Error("Failed to load service categories.");
      }
      const json = await res.json();
      setCategories(json.data);
    } catch (error) {
      setCategoryError(
        error instanceof Error ? error.message : "Failed to load service categories."
      );
    } finally {
      setCategoriesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const filteredServices = services.filter(
    (service) =>
      service.name.toLowerCase().includes(search.toLowerCase()) ||
      service.category.toLowerCase().includes(search.toLowerCase())
  );

  if (servicesLoading) {
    return (
      <div className="space-y-4">
        <div className="text-warmgrey text-sm">Loading services...</div>
      </div>
    );
  }

  function openCreateServiceModal() {
    setEditingService(null);
    setServiceForm({
      ...defaultServiceForm,
      category: categories[0]?.name ?? "",
    });
    setServiceFormError(null);
    setShowServiceModal(true);
  }

  function openEditServiceModal(service: Service) {
    setEditingService(service);
    setServiceForm({
      name: service.name,
      category: service.category,
      price: service.price.replace(/[^0-9.]/g, ""),
      availability: service.availability,
      status: service.status,
      icon: service.icon,
      image: service.image ?? "",
    });
    setServiceFormError(null);
    setShowServiceModal(true);
    setOpenMenuId(null);
  }

  async function handleDeleteService(id: number) {
    setDeletingService(true);
    try {
      const res = await fetch(`/api/services/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? "Failed to delete service.");
      }
      setDeleteServiceId(null);
      await fetchServices();
    } catch (error) {
      console.error("Failed to delete service", error);
    } finally {
      setDeletingService(false);
    }
  }

  async function handleSaveService(e: React.FormEvent) {
    e.preventDefault();

    if (!serviceForm.name.trim()) {
      setServiceFormError("Service name is required.");
      return;
    }

    if (!serviceForm.category.trim()) {
      setServiceFormError("Service category is required.");
      return;
    }

    if (!serviceForm.price.trim()) {
      setServiceFormError("Price is required.");
      return;
    }

    if (!serviceForm.availability.trim()) {
      setServiceFormError("Availability is required.");
      return;
    }

    try {
      const url = editingService
        ? `/api/services/${editingService.id}`
        : "/api/services";
      const method = editingService ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: serviceForm.name.trim(),
          category: serviceForm.category.trim(),
          price: serviceForm.price.trim().replace(/[^0-9.]/g, ""),
          availability: serviceForm.availability.trim(),
          status: serviceForm.status,
          image: serviceForm.image || null,
        }),
      });

      if (!response.ok) {
        const json = await response.json();
        throw new Error(json.error ?? "Failed to save service.");
      }

      await fetchServices();
      setShowServiceModal(false);
      setServiceForm(defaultServiceForm);
      setEditingService(null);
      setServiceFormError(null);
    } catch (error) {
      setServiceFormError(
        error instanceof Error ? error.message : "Failed to save service."
      );
    }
  }

  function openCreateCategoryModal() {
    setEditingCategory(null);
    setCategoryForm(defaultCategoryForm);
    setCategoryFormError(null);
    setShowCategoryModal(true);
  }

  function openEditCategoryModal(category: ServiceCategory) {
    setEditingCategory(category);
    setCategoryForm({
      name: category.name,
      description: category.description,
    });
    setCategoryFormError(null);
    setShowCategoryModal(true);
  }

  async function handleSaveCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!categoryForm.name.trim()) {
      setCategoryFormError("Category name is required.");
      return;
    }

    setSavingCategory(true);
    setCategoryFormError(null);

    try {
      const url = editingCategory
        ? `/api/service-categories/${editingCategory.id}`
        : "/api/service-categories";
      const method = editingCategory ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: categoryForm.name.trim(),
          description: categoryForm.description.trim(),
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? "Failed to save category.");
      }

      await fetchCategories();
      setShowCategoryModal(false);
    } catch (error) {
      setCategoryFormError(
        error instanceof Error ? error.message : "Failed to save category."
      );
    } finally {
      setSavingCategory(false);
    }
  }

  async function handleDeleteCategory(id: string) {
    setDeletingCategory(true);
    try {
      const res = await fetch(`/api/service-categories/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("Failed to delete category.");
      }

      setDeleteCategoryId(null);
      await fetchCategories();
    } catch (error) {
      setCategoryError(
        error instanceof Error ? error.message : "Failed to delete category."
      );
    } finally {
      setDeletingCategory(false);
    }
  }

  const inputCls = "w-full px-3 py-2 text-sm bg-gray-50 border border-lightstone rounded-xl focus:outline-none focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta transition placeholder:text-warmgrey";

  return (
    <div className="space-y-6 pb-6">

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: "Total Services",    value: services.length,                                          icon: Package,      color: "bg-terracotta"  },
          { label: "Available",         value: services.filter(s => s.status === "Available").length,    icon: CheckCircle,  color: "bg-sage" },
          { label: "Busy",              value: services.filter(s => s.status === "Busy").length,         icon: AlertCircle,  color: "bg-terracotta"   },
          { label: "Categories",        value: categories.length,                                        icon: Tag,          color: "bg-terracotta"  },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-lightstone shadow-sm p-5">
            <div className="mb-3">
              <div className={clsx("w-10 h-10 rounded-xl flex items-center justify-center", color)}>
                <Icon size={18} className="text-white" />
              </div>
            </div>
            <p className="text-xl font-bold text-charcoal">{value}</p>
            <p className="text-sm text-warmgrey mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Categories section */}
      <div className="bg-white rounded-2xl border border-lightstone shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-lightstone">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
              <Tag size={15} className="text-terracotta" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-charcoal">Service Categories</h2>
              <p className="text-xs text-warmgrey">{categories.length} categories total</p>
            </div>
          </div>
          <button
            onClick={openCreateCategoryModal}
            className="inline-flex items-center gap-1.5 text-sm font-semibold bg-terracotta hover:bg-accent-700 text-white px-3.5 py-2 rounded-xl transition shadow-sm shadow-soft"
          >
            <Plus size={14} /> Add Category
          </button>
        </div>

        {categoryError && (
          <p className="px-5 py-3 text-sm text-rosewood bg-dustyrose/10 border-b border-dustyrose/20">{categoryError}</p>
        )}

        {categoriesLoading ? (
          <div className="flex items-center justify-center py-10">
            <div className="flex gap-1.5">
              {[0,1,2].map(i => (
                <div key={i} className="w-2 h-2 rounded-full bg-terracotta animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
          </div>
        ) : categories.length === 0 ? (
          <div className="text-center py-10">
            <Tag size={28} className="text-lightstone mx-auto mb-2" />
            <p className="text-sm text-warmgrey">No categories yet. Add one to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 p-5">
            {categories.map((category, i) => (
              <div
                key={category.id}
                className="group flex items-center justify-between gap-3 p-4 rounded-xl border border-lightstone bg-warmlinen/60 hover:bg-white hover:shadow-sm transition-all"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={clsx("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", catColors[i % catColors.length])}>
                    <Wrench size={13} className="text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-charcoal truncate">{category.name}</p>
                    <p className="text-[11px] text-warmgrey truncate">{category.description || "No description"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition">
                  <button onClick={() => openEditCategoryModal(category)}
                    className="p-1.5 rounded-lg text-warmgrey hover:text-terracotta hover:bg-accent-50 transition" title="Edit">
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => setDeleteCategoryId(category.id)}
                    className="p-1.5 rounded-lg text-warmgrey hover:text-rosewood hover:bg-dustyrose/10 transition" title="Delete">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Services section */}
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-warmgrey" />
            <input
              type="text"
              placeholder="Search services…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 pr-4 py-2 text-sm bg-white border border-lightstone rounded-xl focus:outline-none focus:ring-2 focus:ring-terracotta/30 w-64 transition"
            />
          </div>
          <button
            onClick={openCreateServiceModal}
            className="inline-flex items-center gap-1.5 text-sm font-semibold bg-terracotta hover:bg-accent-700 text-white px-4 py-2 rounded-xl transition shadow-sm shadow-soft"
          >
            <Plus size={14} /> Add Service
          </button>
        </div>

        {/* Service cards grid */}
        {servicesLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <div className="flex gap-1.5">
                {[0,1,2].map(i => (
                  <div key={i} className="w-2 h-2 rounded-full bg-terracotta animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
              <p className="text-sm text-warmgrey">Loading services…</p>
            </div>
          </div>
        ) : filteredServices.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-lightstone">
            <Package size={32} className="text-lightstone mx-auto mb-3" />
            <p className="text-sm text-warmgrey">No services found.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredServices.map((service, i) => {
              const st = statusCfg[service.status] ?? statusCfg["Available"];
              return (
                <div key={service.id} className="bg-white rounded-2xl border border-lightstone shadow-sm hover:shadow-md transition-all group p-5 flex flex-col gap-4">
                  {/* Card header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      {service.image ? (
                        <div className="w-11 h-11 rounded-xl overflow-hidden shrink-0 border border-lightstone">
                          <img src={service.image} alt={service.name} className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className={clsx("w-11 h-11 rounded-xl flex items-center justify-center text-white text-sm font-extrabold shrink-0", catColors[i % catColors.length])}>
                          {service.icon}
                        </div>
                      )}
                      <div>
                        <h3 className="text-sm font-bold text-charcoal leading-tight">{service.name}</h3>
                        <p className="text-[11px] text-warmgrey mt-0.5">{service.category}</p>
                      </div>
                    </div>
                    {/* Menu */}
                    <div className="relative">
                      <button
                        onClick={() => setOpenMenuId(openMenuId === service.id ? null : service.id)}
                        className="p-1.5 rounded-lg hover:bg-accent-50 text-warmgrey hover:text-warmgrey transition opacity-0 group-hover:opacity-100"
                      >
                        <span className="text-sm font-bold tracking-widest leading-none">···</span>
                      </button>
                      {openMenuId === service.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                          <div className="absolute right-0 top-full mt-1 w-36 bg-white rounded-xl shadow-lg border border-lightstone py-1 z-20 text-sm">
                            <button onClick={() => openEditServiceModal(service)}
                              className="flex items-center gap-2 w-full px-3 py-2 text-warmgrey hover:bg-accent-50 hover:text-terracotta transition">
                              <Pencil size={13} /> Edit
                            </button>
                            <button onClick={() => { setDeleteServiceId(service.id); setOpenMenuId(null); }}
                              className="flex items-center gap-2 w-full px-3 py-2 text-warmgrey hover:bg-dustyrose/10 hover:text-rosewood transition">
                              <Trash2 size={13} /> Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="border-t border-lightstone/50" />

                  {/* Card footer */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 text-terracotta">
                      <DollarSign size={14} />
                      <span className="text-lg font-bold">{service.price.replace("S$", "").replace("₹", "")}</span>
                    </div>
                    <span className={clsx("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[11px] font-semibold", st.cls)}>
                      <span className={clsx("w-1.5 h-1.5 rounded-full", st.dot)} />
                      {service.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-warmgrey -mt-2">
                    Availability: <span className="text-warmgrey font-medium">{service.availability}</span>
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Add / Edit Service Modal ── */}
      {showServiceModal && (
        <ModalPortal>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/20">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 border border-lightstone overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-lightstone">
              <div>
                <h2 className="text-base font-bold text-charcoal">{editingService ? "Edit Service" : "Add Service"}</h2>
                <p className="text-xs text-warmgrey mt-0.5">Fill in the service details</p>
              </div>
              <button onClick={() => { setShowServiceModal(false); setEditingService(null); }}
                className="p-1.5 hover:bg-accent-50 rounded-lg transition">
                <X size={16} className="text-warmgrey" />
              </button>
            </div>
            <form onSubmit={handleSaveService} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-warmgrey mb-1.5">Service Name *</label>
                  <input type="text" placeholder="e.g. AC Repair" value={serviceForm.name}
                    onChange={e => setServiceForm(p => ({ ...p, name: e.target.value }))} className={inputCls} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-warmgrey mb-1.5">Category *</label>
                  <select value={serviceForm.category}
                    onChange={e => setServiceForm(p => ({ ...p, category: e.target.value }))} className={inputCls}>
                    {categories.length === 0 && <option value="">No categories available</option>}
                    {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-warmgrey mb-1.5">Price (S$) *</label>
                  <input type="number" step="0.01" min="0" placeholder="e.g. 499" value={serviceForm.price}
                    onChange={e => setServiceForm(p => ({ ...p, price: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-warmgrey mb-1.5">Status</label>
                  <select value={serviceForm.status}
                    onChange={e => setServiceForm(p => ({ ...p, status: e.target.value as Service["status"] }))} className={inputCls}>
                    <option value="Available">Available</option>
                    <option value="Busy">Busy</option>
                    <option value="Offline">Offline</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-warmgrey mb-1.5">Availability *</label>
                  <input type="text" placeholder="e.g. Mon–Sat" value={serviceForm.availability}
                    onChange={e => setServiceForm(p => ({ ...p, availability: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-warmgrey mb-1.5">Image</label>
                  <select value={serviceForm.image}
                    onChange={e => setServiceForm(p => ({ ...p, image: e.target.value }))} className={inputCls}>
                    <option value="">None (use initials)</option>
                    {(serviceForm.image && !availableImages.includes(serviceForm.image)
                      ? [serviceForm.image, ...availableImages]
                      : availableImages
                    ).map(img => (
                      <option key={img} value={img}>{imageLabel(img)}</option>
                    ))}
                  </select>
                </div>
                {serviceForm.image && (
                  <div className="col-span-2">
                    <img src={serviceForm.image} alt="Preview" className="h-16 w-24 object-cover rounded-xl border border-lightstone" />
                  </div>
                )}
              </div>
              {serviceFormError && <p className="text-xs text-rosewood">{serviceFormError}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => { setShowServiceModal(false); setEditingService(null); }}
                  className="px-4 py-2 text-sm font-semibold text-warmgrey bg-accent-50 hover:bg-lightstone rounded-xl transition">
                  Cancel
                </button>
                <button type="submit"
                  className="px-5 py-2 text-sm font-bold bg-terracotta hover:bg-accent-700 text-white rounded-xl shadow-sm shadow-soft transition">
                  {editingService ? "Update Service" : "Add Service"}
                </button>
              </div>
            </form>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* ── Add / Edit Category Modal ── */}
      {showCategoryModal && (
        <ModalPortal>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/20">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 border border-lightstone overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-lightstone">
              <div>
                <h2 className="text-base font-bold text-charcoal">{editingCategory ? "Edit Category" : "Add Category"}</h2>
                <p className="text-xs text-warmgrey mt-0.5">Service category details</p>
              </div>
              <button onClick={() => setShowCategoryModal(false)}
                className="p-1.5 hover:bg-accent-50 rounded-lg transition">
                <X size={16} className="text-warmgrey" />
              </button>
            </div>
            <form onSubmit={handleSaveCategory} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-warmgrey mb-1.5">Category Name *</label>
                <input type="text" placeholder="e.g. Plumbing" value={categoryForm.name}
                  onChange={e => setCategoryForm(p => ({ ...p, name: e.target.value }))}
                  className={clsx(inputCls, categoryFormError && "border-red-300 focus:ring-red-400/50")} />
                {categoryFormError && <p className="text-xs text-rosewood mt-1">{categoryFormError}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-warmgrey mb-1.5">Description</label>
                <textarea rows={3} placeholder="Short description…" value={categoryForm.description}
                  onChange={e => setCategoryForm(p => ({ ...p, description: e.target.value }))}
                  className={clsx(inputCls, "resize-none")} />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setShowCategoryModal(false)}
                  className="px-4 py-2 text-sm font-semibold text-warmgrey bg-accent-50 hover:bg-lightstone rounded-xl transition">
                  Cancel
                </button>
                <button type="submit" disabled={savingCategory}
                  className="px-5 py-2 text-sm font-bold bg-terracotta hover:bg-accent-700 text-white rounded-xl shadow-sm shadow-soft transition disabled:opacity-60">
                  {savingCategory ? "Saving…" : editingCategory ? "Update" : "Add Category"}
                </button>
              </div>
            </form>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* ── Delete Category Confirm ── */}
      {deleteCategoryId && (
        <ModalPortal>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/20">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 border border-lightstone space-y-4">
            <div className="w-10 h-10 rounded-xl bg-dustyrose/10 flex items-center justify-center mb-1">
              <Trash2 size={18} className="text-rosewood" />
            </div>
            <div>
              <h3 className="text-base font-bold text-charcoal">Delete Category?</h3>
              <p className="text-sm text-warmgrey mt-1">This action cannot be undone.</p>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setDeleteCategoryId(null)}
                className="px-4 py-2 text-sm font-semibold text-warmgrey bg-accent-50 hover:bg-lightstone rounded-xl transition">
                Cancel
              </button>
              <button onClick={() => handleDeleteCategory(deleteCategoryId)} disabled={deletingCategory}
                className="px-4 py-2 text-sm font-bold bg-dustyrose hover:bg-dustyrose text-white rounded-xl transition disabled:opacity-60">
                {deletingCategory ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {/* ── Delete Service Confirm ── */}
      {deleteServiceId !== null && (
        <ModalPortal>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/20">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 border border-lightstone space-y-4">
            <div className="w-10 h-10 rounded-xl bg-dustyrose/10 flex items-center justify-center mb-1">
              <Trash2 size={18} className="text-rosewood" />
            </div>
            <div>
              <h3 className="text-base font-bold text-charcoal">Delete Service?</h3>
              <p className="text-sm text-warmgrey mt-1">This will permanently remove this service.</p>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setDeleteServiceId(null)}
                className="px-4 py-2 text-sm font-semibold text-warmgrey bg-accent-50 hover:bg-lightstone rounded-xl transition">
                Cancel
              </button>
              <button onClick={() => handleDeleteService(deleteServiceId)} disabled={deletingService}
                className="px-4 py-2 text-sm font-bold bg-dustyrose hover:bg-dustyrose text-white rounded-xl transition disabled:opacity-60">
                {deletingService ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </div>
  );
}
