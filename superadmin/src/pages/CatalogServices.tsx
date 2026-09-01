import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, X, Upload, Package, Tag, Layers } from 'lucide-react';
import clsx from 'clsx';
import ModalPortal from '@/components/ModalPortal';
import { apiFetch, serviceImageUrl } from '@/lib/api';

type CatalogCategory = {
  id: number;
  name: string;
  variant_schema: any;
};

type PricingRule = {
  id?: number;
  strategy: 'flat' | 'hourly' | 'per_unit' | 'tiered' | 'custom_quote';
  params: any;
};

type BookingMode = {
  id?: number;
  mode: 'on_demand' | 'scheduled' | 'recurring';
  min_lead_time_hours: number;
};

type Variant = {
  id?: number;
  attribute_key: string;
  attribute_value: string;
};

type CatalogService = {
  id: number;
  name: string;
  description: string;
  image: string | null;
  status: 'live' | 'pending_rates' | 'paused';
  category: string;
  category_id: number;
  default_partner_cost: number | null;
  markup_pct_override: number | null;
  pricing_rules: PricingRule[];
  booking_modes: BookingMode[];
  variants: Variant[];
};

const statusOptions: CatalogService['status'][] = ['live', 'pending_rates', 'paused'];
const inputCls =
  'w-full px-3 py-2 text-sm bg-gray-50 border border-lightstone rounded-xl focus:outline-none focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta transition placeholder:text-warmgrey';

function imageLabel(src: string) {
  return src
    .replace('/images/', '')
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c: string) => c.toUpperCase());
}

const defaultMode = (mode: BookingMode['mode']): BookingMode => ({
  mode,
  min_lead_time_hours: 0,
});

export default function CatalogServicesPage() {
  const [services, setServices] = useState<CatalogService[]>([]);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [availableImages, setAvailableImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingService, setEditingService] = useState<CatalogService | null>(null);
  const [form, setForm] = useState<any>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);

  const [deleteServiceId, setDeleteServiceId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ name: '', description: '' });
  const [categoryFormError, setCategoryFormError] = useState<string | null>(null);
  const [savingCategory, setSavingCategory] = useState(false);

  const fetchCategories = async () => {
    try {
      const res = await apiFetch('/api/catalog/categories');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to load categories.');
      setCategories(json.data ?? []);
    } catch (err) {
      console.error('Failed to fetch categories', err);
    }
  };

  const fetchServices = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/catalog/services');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to load catalog services.');
      setServices(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load catalog services.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServices();
    apiFetch('/api/catalog/categories')
      .then((res) => res.json())
      .then((json) => setCategories(json.data ?? []))
      .catch((err) => console.error('Failed to fetch categories', err));
    apiFetch('/api/images')
      .then((res) => res.json())
      .then((json) => setAvailableImages(json.data ?? []))
      .catch((err) => console.error('Failed to fetch images', err));
  }, []);

  const filteredServices = useMemo(
    () =>
      services.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [services]
  );

  function buildEmptyForm(): any {
    return {
      name: '',
      category_id: categories[0]?.id ?? '',
      description: '',
      image: '',
      status: 'pending_rates',
      default_partner_cost: '',
      markup_pct_override: '',
      pricing_rules: [
        {
          strategy: 'flat',
          params: { amount: '' },
        },
      ],
      booking_modes: [] as BookingMode['mode'][],
      variants: [] as Variant[],
    };
  }

  function openCreate() {
    setEditingService(null);
    setForm(buildEmptyForm());
    setFormError(null);
    setImageFile(null);
    setImageUploadError(null);
    setShowModal(true);
  }

  function openCreateCategory() {
    setCategoryForm({ name: '', description: '' });
    setCategoryFormError(null);
    setShowCategoryModal(true);
  }

  async function handleSaveCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!categoryForm.name.trim()) {
      setCategoryFormError('Category name is required.');
      return;
    }
    setSavingCategory(true);
    setCategoryFormError(null);

    try {
      const res = await apiFetch('/api/catalog/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: categoryForm.name.trim(),
          description: categoryForm.description.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to create category.');

      setShowCategoryModal(false);
      setCategoryForm({ name: '', description: '' });
      await fetchCategories();
      setForm((prev: any) => ({ ...prev, category_id: json.id }));
    } catch (err) {
      setCategoryFormError(err instanceof Error ? err.message : 'Failed to create category.');
    } finally {
      setSavingCategory(false);
    }
  }

  async function openEdit(service: CatalogService) {
    setEditingService(service);
    setFormError(null);
    setImageFile(null);
    setImageUploadError(null);
    try {
      const res = await apiFetch(`/api/catalog/services/${service.id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to load service detail.');
      const detail = json.data;
      setForm({
        name: detail.name,
        category_id: detail.category_id,
        description: detail.description ?? '',
        image: detail.image ?? '',
        status: detail.status,
        default_partner_cost: detail.default_partner_cost ?? '',
        markup_pct_override: detail.markup_pct_override ?? '',
        pricing_rules: detail.pricing_rules?.length
          ? detail.pricing_rules.map((r: PricingRule) => ({
              ...r,
              params: typeof r.params === 'string' ? JSON.parse(r.params) : r.params,
            }))
          : buildEmptyForm().pricing_rules,
        booking_modes: (detail.booking_modes ?? []).map((m: BookingMode) => m.mode),
        variants: (detail.variants ?? []).map((v: Variant) => ({
          attribute_key: v.attribute_key,
          attribute_value: v.attribute_value,
        })),
      });
      setShowModal(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load service detail.');
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setFormError('Service name is required.');
      return;
    }
    if (!form.category_id) {
      setFormError('Category is required.');
      return;
    }

    const rule = form.pricing_rules[0];
    const cleanedRule = {
      strategy: rule.strategy,
      params: cleanParams(rule.strategy, rule.params),
    };

    const bookingModes = (form.booking_modes as BookingMode['mode'][]).map((mode) => ({
      mode,
      min_lead_time_hours: 0,
      blackout_dates: [],
      recurrence_frequency: null,
      recurrence_discount_pct: null,
    }));

    const payload = {
      ...form,
      description: form.description || null,
      image: form.image || null,
      default_partner_cost: form.default_partner_cost ? Number(form.default_partner_cost) : null,
      markup_pct_override: form.markup_pct_override ? Number(form.markup_pct_override) : null,
      pricing_rules: [cleanedRule],
      booking_modes: bookingModes,
      variants: form.variants,
    };

    setSaving(true);
    setFormError(null);

    try {
      const url = editingService ? `/api/catalog/services/${editingService.id}` : '/api/catalog/services';
      const method = editingService ? 'PUT' : 'POST';
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to save service.');

      setShowModal(false);
      setEditingService(null);
      setForm(buildEmptyForm());
      await fetchServices();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save service.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteServiceId) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/catalog/services/${deleteServiceId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete service.');
      setDeleteServiceId(null);
      await fetchServices();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete service.');
    } finally {
      setDeleting(false);
    }
  }

  function cleanParams(strategy: string, params: any) {
    switch (strategy) {
      case 'flat':
        return { amount: Number(params.amount) || 0 };
      case 'per_unit':
        return { unit: params.unit || 'person', rate: Number(params.rate) || 0 };
      case 'hourly':
        return { rate_schedule: (params.rate_schedule || []).filter((w: any) => w.start && w.end) };
      case 'tiered':
        return { tiers: Array.isArray(params.tiers) ? params.tiers : [] };
      case 'custom_quote':
      default:
        return {};
    }
  }

  function updatePricingField(path: string, value: any) {
    setForm((prev: any) => {
      const rules = [...prev.pricing_rules];
      const rule = { ...rules[0] };
      const params = { ...rule.params };
      if (path === 'strategy') {
        rule.strategy = value;
        rule.params = defaultParamsFor(value);
      } else if (path.includes('.')) {
        const [p, k] = path.split('.');
        if (p === 'params') (params as any)[k] = value;
        rule.params = params;
      } else {
        (rule as any)[path] = value;
      }
      rules[0] = rule;
      return { ...prev, pricing_rules: rules };
    });
  }

  function defaultParamsFor(strategy: string) {
    switch (strategy) {
      case 'flat':
        return { amount: '' };
      case 'per_unit':
        return { unit: 'person', rate: '' };
      case 'hourly':
        return { rate_schedule: [{ start: '08:00', end: '18:00', rate: '' }] };
      case 'tiered':
        return { tiers: [] };
      default:
        return {};
    }
  }

  function toggleBookingMode(mode: BookingMode['mode']) {
    setForm((prev: any) => {
      const modes = [...prev.booking_modes];
      if (modes.includes(mode)) return { ...prev, booking_modes: modes.filter((m) => m !== mode) };
      return { ...prev, booking_modes: [...modes, mode] };
    });
  }

  function setVariant(index: number, field: 'attribute_key' | 'attribute_value', value: string) {
    setForm((prev: any) => {
      const variants = [...prev.variants];
      variants[index] = { ...variants[index], [field]: value };
      return { ...prev, variants };
    });
  }

  function addVariant() {
    setForm((prev: any) => ({ ...prev, variants: [...prev.variants, { attribute_key: '', attribute_value: '' }] }));
  }

  function removeVariant(index: number) {
    setForm((prev: any) => {
      const variants = [...prev.variants];
      variants.splice(index, 1);
      return { ...prev, variants };
    });
  }

  async function handleImageUpload() {
    if (!imageFile) return;
    setUploadingImage(true);
    setImageUploadError(null);
    try {
      const data = new FormData();
      data.append('image', imageFile);
      const res = await apiFetch('/api/images/upload', {
        method: 'POST',
        body: data,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Image upload failed.');
      setForm((prev: any) => ({ ...prev, image: json.data }));
      setImageFile(null);
    } catch (err) {
      setImageUploadError(err instanceof Error ? err.message : 'Image upload failed.');
    } finally {
      setUploadingImage(false);
    }
  }

  const rule = form.pricing_rules?.[0] || { strategy: 'flat', params: {} };
  const statusCfg: Record<CatalogService['status'], { cls: string; dot: string }> = {
    live: { cls: 'bg-sage/10 text-sage ring-1 ring-sage/20', dot: 'bg-sage' },
    pending_rates: { cls: 'bg-amber-100 text-amber-700 ring-1 ring-amber-500/20', dot: 'bg-amber-500' },
    paused: { cls: 'bg-dustyrose/10 text-rosewood ring-1 ring-dustyrose/20', dot: 'bg-dustyrose' },
  };

  return (
    <div className="space-y-6 pb-6">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Total catalog services', value: services.length, icon: Package, color: 'bg-terracotta' },
          { label: 'Live', value: services.filter((s) => s.status === 'live').length, icon: Layers, color: 'bg-sage' },
          { label: 'Pending rates', value: services.filter((s) => s.status === 'pending_rates').length, icon: Tag, color: 'bg-terracotta' },
          { label: 'Categories', value: categories.length, icon: Tag, color: 'bg-terracotta' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-lightstone shadow-sm p-5">
            <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center mb-3', color)}>
              <Icon size={18} className="text-white" />
            </div>
            <p className="text-xl font-bold text-charcoal">{value}</p>
            <p className="text-sm text-warmgrey mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-lightstone shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-lightstone">
          <div>
            <h2 className="text-sm font-bold text-charcoal">Catalog Services</h2>
            <p className="text-xs text-warmgrey mt-0.5">New modular service catalog</p>
          </div>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 text-sm font-semibold bg-terracotta hover:bg-accent-700 text-white px-3.5 py-2 rounded-xl transition shadow-sm shadow-soft"
          >
            <Plus size={14} /> Add Catalog Service
          </button>
        </div>

        {error && (
          <p className="px-5 py-3 text-sm text-rosewood bg-dustyrose/10 border-b border-dustyrose/20">{error}</p>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-2 h-2 rounded-full bg-terracotta animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        ) : filteredServices.length === 0 ? (
          <div className="text-center py-16">
            <Package size={32} className="text-lightstone mx-auto mb-3" />
            <p className="text-sm text-warmgrey">No catalog services yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 p-5">
            {filteredServices.map((service) => {
              const st = statusCfg[service.status] ?? statusCfg.pending_rates;
              return (
                <div
                  key={service.id}
                  className="bg-white rounded-2xl border border-lightstone shadow-sm p-5 flex flex-col gap-4 hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      {service.image ? (
                        <div className="w-11 h-11 rounded-xl overflow-hidden shrink-0 border border-lightstone">
                          <img src={serviceImageUrl(service.image) ?? ''} alt={service.name} className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-11 h-11 rounded-xl bg-terracotta flex items-center justify-center text-white text-sm font-extrabold shrink-0">
                          {service.name.substring(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <h3 className="text-sm font-bold text-charcoal leading-tight">{service.name}</h3>
                        <p className="text-[11px] text-warmgrey mt-0.5">{service.category}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <button
                        onClick={() => openEdit(service)}
                        className="p-1.5 rounded-lg text-warmgrey hover:text-terracotta hover:bg-accent-50 transition"
                        title="Edit"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => setDeleteServiceId(service.id)}
                        className="p-1.5 rounded-lg text-warmgrey hover:text-rosewood hover:bg-dustyrose/10 transition"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="border-t border-lightstone/50" />

                  <div className="flex items-center justify-between">
                    <div className="text-sm text-charcoal">
                      {service.default_partner_cost !== null && `S$${Number(service.default_partner_cost).toFixed(2)} cost`}
                      {service.markup_pct_override !== null && ` · ${Number(service.markup_pct_override).toFixed(0)}% markup`}
                    </div>
                    <span className={clsx('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[11px] font-semibold', st.cls)}>
                      <span className={clsx('w-1.5 h-1.5 rounded-full', st.dot)} />
                      {service.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showModal && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/20 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl border border-lightstone overflow-hidden max-h-[92vh] flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-lightstone shrink-0">
                <div>
                  <h2 className="text-base font-bold text-charcoal">{editingService ? 'Edit Catalog Service' : 'Add Catalog Service'}</h2>
                  <p className="text-xs text-warmgrey mt-0.5">Define the service, pricing and booking modes</p>
                </div>
                <button
                  onClick={() => { setShowModal(false); setEditingService(null); }}
                  className="p-1.5 hover:bg-accent-50 rounded-lg transition"
                >
                  <X size={16} className="text-warmgrey" />
                </button>
              </div>

              <form onSubmit={handleSave} className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-warmgrey mb-1.5">Name *</label>
                    <input
                      type="text"
                      value={form.name || ''}
                      onChange={(e) => setForm((p: any) => ({ ...p, name: e.target.value }))}
                      className={inputCls}
                      placeholder="e.g. Home Cleaning"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-warmgrey">Category *</label>
                      <button
                        type="button"
                        onClick={openCreateCategory}
                        className="text-[11px] font-semibold text-terracotta hover:text-accent-700"
                      >
                        + Add category
                      </button>
                    </div>
                    <select
                      value={form.category_id || ''}
                      onChange={(e) => setForm((p: any) => ({ ...p, category_id: Number(e.target.value) }))}
                      className={inputCls}
                    >
                      {categories.length === 0 && <option value="">No categories</option>}
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-warmgrey mb-1.5">Status</label>
                    <select
                      value={form.status || 'pending_rates'}
                      onChange={(e) => setForm((p: any) => ({ ...p, status: e.target.value }))}
                      className={inputCls}
                    >
                      {statusOptions.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-warmgrey mb-1.5">Default partner cost</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.default_partner_cost || ''}
                      onChange={(e) => setForm((p: any) => ({ ...p, default_partner_cost: e.target.value }))}
                      className={inputCls}
                      placeholder="e.g. 46"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-warmgrey mb-1.5">Markup % override</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.markup_pct_override || ''}
                      onChange={(e) => setForm((p: any) => ({ ...p, markup_pct_override: e.target.value }))}
                      className={inputCls}
                      placeholder="blank = 30%"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-warmgrey mb-1.5">Description</label>
                    <textarea
                      rows={2}
                      value={form.description || ''}
                      onChange={(e) => setForm((p: any) => ({ ...p, description: e.target.value }))}
                      className={clsx(inputCls, 'resize-none')}
                      placeholder="Short description…"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-warmgrey mb-1.5">Image</label>
                    <div className="flex items-start gap-3">
                      {form.image ? (
                        <div className="w-12 h-12 rounded-xl overflow-hidden border border-lightstone shrink-0">
                          <img
                            src={serviceImageUrl(form.image) ?? ''}
                            alt={form.name || 'Service'}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-terracotta flex items-center justify-center text-white text-sm font-extrabold shrink-0">
                          {form.name?.substring(0, 2).toUpperCase() || '—'}
                        </div>
                      )}
                      <div className="flex-1 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <label className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-charcoal bg-accent-50 hover:bg-lightstone rounded-xl cursor-pointer transition">
                            <Upload size={14} className="text-terracotta" />
                            <span>Choose file</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => {
                                setImageFile(e.target.files?.[0] ?? null);
                                setImageUploadError(null);
                              }}
                              className="hidden"
                            />
                          </label>
                          {imageFile && (
                            <button
                              type="button"
                              onClick={handleImageUpload}
                              disabled={uploadingImage}
                              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-bold text-white bg-terracotta hover:bg-accent-700 rounded-xl transition disabled:opacity-60"
                            >
                              {uploadingImage ? 'Uploading…' : 'Upload'}
                            </button>
                          )}
                          {form.image && (
                            <button
                              type="button"
                              onClick={() => { setForm((p: any) => ({ ...p, image: '' })); setImageFile(null); }}
                              className="p-2 rounded-lg text-warmgrey hover:text-rosewood hover:bg-dustyrose/10 transition"
                              title="Remove image"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                        {imageFile && <p className="text-xs text-warmgrey">Selected: {imageFile.name}</p>}
                        {imageUploadError && <p className="text-xs text-rosewood">{imageUploadError}</p>}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Pricing rule */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-warmgrey uppercase tracking-wide">Pricing rule</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-warmgrey mb-1.5">Strategy</label>
                      <select
                        value={rule.strategy || 'flat'}
                        onChange={(e) => updatePricingField('strategy', e.target.value)}
                        className={inputCls}
                      >
                        <option value="flat">Flat</option>
                        <option value="hourly">Hourly</option>
                        <option value="per_unit">Per unit</option>
                        <option value="tiered">Tiered</option>
                        <option value="custom_quote">Custom quote</option>
                      </select>
                    </div>

                    {rule.strategy === 'flat' && (
                      <div>
                        <label className="block text-xs font-semibold text-warmgrey mb-1.5">Amount</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={rule.params.amount || ''}
                          onChange={(e) => updatePricingField('params.amount', e.target.value)}
                          className={inputCls}
                          placeholder="e.g. 60"
                        />
                      </div>
                    )}

                    {rule.strategy === 'per_unit' && (
                      <>
                        <div>
                          <label className="block text-xs font-semibold text-warmgrey mb-1.5">Rate</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={rule.params.rate || ''}
                            onChange={(e) => updatePricingField('params.rate', e.target.value)}
                            className={inputCls}
                            placeholder="e.g. 80"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-warmgrey mb-1.5">Unit</label>
                          <input
                            type="text"
                            value={rule.params.unit || 'person'}
                            onChange={(e) => updatePricingField('params.unit', e.target.value)}
                            className={inputCls}
                            placeholder="person, room…"
                          />
                        </div>
                      </>
                    )}
                  </div>

                  {rule.strategy === 'hourly' && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-warmgrey">Rate schedule</p>
                      {(rule.params.rate_schedule || []).map((window: any, index: number) => (
                        <div key={index} className="grid grid-cols-3 gap-3 items-end">
                          <div>
                            <label className="block text-[10px] text-warmgrey mb-1">Start</label>
                            <input
                              type="time"
                              value={window.start || ''}
                              onChange={(e) => {
                                const schedule = [...(rule.params.rate_schedule || [])];
                                schedule[index] = { ...schedule[index], start: e.target.value };
                                updatePricingField('params.rate_schedule', schedule);
                              }}
                              className={inputCls}
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-warmgrey mb-1">End</label>
                            <input
                              type="time"
                              value={window.end || ''}
                              onChange={(e) => {
                                const schedule = [...(rule.params.rate_schedule || [])];
                                schedule[index] = { ...schedule[index], end: e.target.value };
                                updatePricingField('params.rate_schedule', schedule);
                              }}
                              className={inputCls}
                            />
                          </div>
                          <div className="flex gap-2">
                            <div className="flex-1">
                              <label className="block text-[10px] text-warmgrey mb-1">Rate</label>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={window.rate || ''}
                                onChange={(e) => {
                                  const schedule = [...(rule.params.rate_schedule || [])];
                                  schedule[index] = { ...schedule[index], rate: e.target.value };
                                  updatePricingField('params.rate_schedule', schedule);
                                }}
                                className={inputCls}
                                placeholder="23"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const schedule = (rule.params.rate_schedule || []).filter((_: any, i: number) => i !== index);
                                updatePricingField('params.rate_schedule', schedule);
                              }}
                              className="p-2 rounded-lg text-warmgrey hover:text-rosewood hover:bg-dustyrose/10 transition"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          const schedule = [...(rule.params.rate_schedule || []), { start: '', end: '', rate: '' }];
                          updatePricingField('params.rate_schedule', schedule);
                        }}
                        className="text-xs font-semibold text-terracotta hover:text-accent-700"
                      >
                        + Add time window
                      </button>
                    </div>
                  )}
                </div>

                {/* Booking modes */}
                <div>
                  <p className="text-xs font-semibold text-warmgrey uppercase tracking-wide mb-2">Booking modes</p>
                  <div className="flex gap-4">
                    {(['on_demand', 'scheduled', 'recurring'] as BookingMode['mode'][]).map((mode) => (
                      <label key={mode} className="flex items-center gap-1.5 text-sm text-charcoal cursor-pointer">
                        <input
                          type="checkbox"
                          checked={(form.booking_modes || []).includes(mode)}
                          onChange={() => toggleBookingMode(mode)}
                          className="rounded border-lightstone text-terracotta focus:ring-terracotta/30"
                        />
                        {mode.replace('_', '-')}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Variants */}
                <div>
                  <p className="text-xs font-semibold text-warmgrey uppercase tracking-wide mb-2">Variant attributes</p>
                  <div className="space-y-2">
                    {(form.variants || []).map((v: Variant, index: number) => (
                      <div key={index} className="grid grid-cols-5 gap-2 items-center">
                        <div className="col-span-2">
                          <input
                            type="text"
                            value={v.attribute_key}
                            onChange={(e) => setVariant(index, 'attribute_key', e.target.value)}
                            className={inputCls}
                            placeholder="key"
                          />
                        </div>
                        <div className="col-span-2">
                          <input
                            type="text"
                            value={v.attribute_value}
                            onChange={(e) => setVariant(index, 'attribute_value', e.target.value)}
                            className={inputCls}
                            placeholder="value"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeVariant(index)}
                          className="p-2 rounded-lg text-warmgrey hover:text-rosewood hover:bg-dustyrose/10 transition"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addVariant}
                      className="text-xs font-semibold text-terracotta hover:text-accent-700"
                    >
                      + Add variant attribute
                    </button>
                  </div>
                </div>

                {formError && <p className="text-xs text-rosewood">{formError}</p>}

                <div className="flex justify-end gap-2 pt-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => { setShowModal(false); setEditingService(null); }}
                    className="px-4 py-2 text-sm font-semibold text-warmgrey bg-accent-50 hover:bg-lightstone rounded-xl transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2 text-sm font-bold bg-terracotta hover:bg-accent-700 text-white rounded-xl shadow-sm shadow-soft transition disabled:opacity-60"
                  >
                    {saving ? 'Saving…' : editingService ? 'Update' : 'Add Service'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </ModalPortal>
      )}

      {deleteServiceId !== null && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/20 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 border border-lightstone space-y-4">
              <div className="w-10 h-10 rounded-xl bg-dustyrose/10 flex items-center justify-center mb-1">
                <Trash2 size={18} className="text-rosewood" />
              </div>
              <div>
                <h3 className="text-base font-bold text-charcoal">Delete catalog service?</h3>
                <p className="text-sm text-warmgrey mt-1">This cannot be undone.</p>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setDeleteServiceId(null)}
                  className="px-4 py-2 text-sm font-semibold text-warmgrey bg-accent-50 hover:bg-lightstone rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-4 py-2 text-sm font-bold bg-dustyrose hover:bg-dustyrose text-white rounded-xl transition disabled:opacity-60"
                >
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {showCategoryModal && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/20 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm border border-lightstone overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-lightstone">
                <div>
                  <h2 className="text-base font-bold text-charcoal">Add Category</h2>
                  <p className="text-xs text-warmgrey mt-0.5">New catalog category</p>
                </div>
                <button
                  onClick={() => setShowCategoryModal(false)}
                  className="p-1.5 hover:bg-accent-50 rounded-lg transition"
                >
                  <X size={16} className="text-warmgrey" />
                </button>
              </div>
              <form onSubmit={handleSaveCategory} className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-warmgrey mb-1.5">Name *</label>
                  <input
                    type="text"
                    value={categoryForm.name}
                    onChange={(e) => setCategoryForm((p) => ({ ...p, name: e.target.value }))}
                    className={inputCls}
                    placeholder="e.g. Cleaning"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-warmgrey mb-1.5">Description</label>
                  <textarea
                    rows={3}
                    value={categoryForm.description}
                    onChange={(e) => setCategoryForm((p) => ({ ...p, description: e.target.value }))}
                    className={clsx(inputCls, 'resize-none')}
                    placeholder="Short description…"
                  />
                </div>
                {categoryFormError && <p className="text-xs text-rosewood">{categoryFormError}</p>}
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowCategoryModal(false)}
                    className="px-4 py-2 text-sm font-semibold text-warmgrey bg-accent-50 hover:bg-lightstone rounded-xl transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingCategory}
                    className="px-5 py-2 text-sm font-bold bg-terracotta hover:bg-accent-700 text-white rounded-xl shadow-sm shadow-soft transition disabled:opacity-60"
                  >
                    {savingCategory ? 'Saving…' : 'Add Category'}
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
