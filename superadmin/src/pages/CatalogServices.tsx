import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, X, Upload, Package, Tag, Layers } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import ModalPortal from '@/components/ModalPortal';
import { apiFetch, serviceImageUrl } from '@/lib/api';

type CatalogCategory = {
  id: number;
  name: string;
  description: string | null;
  image: string | null;
  sort_order: number;
  variant_schema: any;
};

type CatalogSubcategory = {
  id: number;
  category_id: number;
  name: string;
  description: string | null;
  image: string | null;
  is_addon: boolean;
  sort_order: number;
  service_count: number;
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
  duration: string | null;
  worker_count: number | null;
  rate_type: string | null;
  status: 'live' | 'pending_rates' | 'paused';
  category: string;
  category_id: number;
  subcategory: string | null;
  subcategory_id: number | null;
  default_partner_cost: number | null;
  markup_pct_override: number | null;
  pricing_rules: PricingRule[];
  booking_modes: BookingMode[];
  variants: Variant[];
};

const statusOptions: CatalogService['status'][] = ['live', 'pending_rates', 'paused'];
const rateTypeOptions = [
  { value: 'day_rate', label: 'Day rate' },
  { value: 'evening_rate', label: 'Evening rate' },
  { value: 'per_unit', label: 'Per unit' },
  { value: 'per_job', label: 'Per job' },
  { value: 'package', label: 'Package price' },
];
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

// Choose-file -> POST /api/images/upload -> store the returned /images/<name>
// path. Used by the service, category and subcategory forms.
function ImageUploadField({
  value,
  name,
  onChange,
}: {
  value: string;
  name: string;
  onChange: (path: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function upload() {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const data = new FormData();
      data.append('image', file);
      const res = await apiFetch('/api/images/upload', { method: 'POST', body: data });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Image upload failed.');
      onChange(json.data);
      setFile(null);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Image upload failed.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-start gap-3">
      {value ? (
        <div className="w-12 h-12 rounded-xl overflow-hidden border border-lightstone shrink-0">
          <img src={serviceImageUrl(value) ?? ''} alt={name || 'Image'} className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="w-12 h-12 rounded-xl bg-terracotta flex items-center justify-center text-white text-sm font-extrabold shrink-0">
          {name?.substring(0, 2).toUpperCase() || '—'}
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
                setFile(e.target.files?.[0] ?? null);
                setUploadError(null);
              }}
              className="hidden"
            />
          </label>
          {file && (
            <button
              type="button"
              onClick={upload}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-bold text-white bg-terracotta hover:bg-accent-700 rounded-xl transition disabled:opacity-60"
            >
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
          )}
          {value && (
            <button
              type="button"
              onClick={() => { onChange(''); setFile(null); }}
              className="p-2 rounded-lg text-warmgrey hover:text-rosewood hover:bg-dustyrose/10 transition"
              title="Remove image"
            >
              <X size={14} />
            </button>
          )}
        </div>
        {file && <p className="text-xs text-warmgrey">Selected: {file.name}</p>}
        {uploadError && <p className="text-xs text-rosewood">{uploadError}</p>}
      </div>
    </div>
  );
}

export default function CatalogServicesPage() {
  const [services, setServices] = useState<CatalogService[]>([]);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [subcategories, setSubcategories] = useState<CatalogSubcategory[]>([]);
  const [availableImages, setAvailableImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingService, setEditingService] = useState<CatalogService | null>(null);
  const [form, setForm] = useState<any>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteServiceId, setDeleteServiceId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CatalogCategory | null>(null);
  const [categoryForm, setCategoryForm] = useState<{ name: string; description: string; image: string; variant_schema: any[] }>({
    name: '',
    description: '',
    image: '',
    variant_schema: [],
  });
  const [categoryFormError, setCategoryFormError] = useState<string | null>(null);
  const [savingCategory, setSavingCategory] = useState(false);

  const [showSubcategoryModal, setShowSubcategoryModal] = useState(false);
  const [editingSubcategory, setEditingSubcategory] = useState<CatalogSubcategory | null>(null);
  const [subcategoryForm, setSubcategoryForm] = useState<{
    name: string;
    description: string;
    image: string;
    sort_order: string;
    is_addon: boolean;
  }>({
    name: '',
    description: '',
    image: '',
    sort_order: '0',
    is_addon: false,
  });
  const [subcategoryFormError, setSubcategoryFormError] = useState<string | null>(null);
  const [savingSubcategory, setSavingSubcategory] = useState(false);

  const [searchParams] = useSearchParams();
  const query = searchParams.get('q')?.toLowerCase().trim() ?? '';

  const fetchCategories = async () => {
    try {
      const res = await apiFetch('/api/catalog/categories');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to load categories.');
      const data = (json.data ?? []).map((c: any) => {
        let variant_schema = c.variant_schema;
        if (typeof variant_schema === 'string') {
          try { variant_schema = JSON.parse(variant_schema); } catch { variant_schema = []; }
        }
        if (!Array.isArray(variant_schema)) variant_schema = [];
        return { ...c, variant_schema };
      });
      setCategories(data);
    } catch (err) {
      console.error('Failed to fetch categories', err);
    }
  };

  const fetchSubcategories = async () => {
    try {
      const res = await apiFetch('/api/catalog/subcategories');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to load subcategories.');
      setSubcategories(json.data ?? []);
    } catch (err) {
      console.error('Failed to fetch subcategories', err);
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
    fetchSubcategories();
    apiFetch('/api/catalog/categories')
      .then((res) => res.json())
      .then((json) => setCategories(json.data ?? []))
      .catch((err) => console.error('Failed to fetch categories', err));
    apiFetch('/api/images')
      .then((res) => res.json())
      .then((json) => setAvailableImages(json.data ?? []))
      .catch((err) => console.error('Failed to fetch images', err));
  }, []);

  const filteredServices = useMemo(() => {
    let list = services;
    if (query) {
      list = services.filter((s) =>
        s.name.toLowerCase().includes(query) ||
        s.category.toLowerCase().includes(query) ||
        (s.subcategory ?? '').toLowerCase().includes(query) ||
        (s.description ?? '').toLowerCase().includes(query)
      );
    }
    return list.slice().sort((a, b) => a.name.localeCompare(b.name));
  }, [services, query]);

  const selectedCategory = useMemo(() => {
    return categories.find((c) => c.id === Number(form?.category_id));
  }, [categories, form?.category_id]);

  // A subcategory only belongs to one category, so the picker is scoped to
  // whichever category is currently selected on the form.
  const subcategoriesForCategory = useMemo(() => {
    return subcategories.filter((s) => s.category_id === Number(form?.category_id));
  }, [subcategories, form?.category_id]);

  useEffect(() => {
    const schema = selectedCategory?.variant_schema;
    if (!Array.isArray(schema) || !schema.length) return;
    setForm((prev: any) => {
      const existing = new Map((prev.variants || []).map((v: Variant) => [v.attribute_key, v.attribute_value]));
      const next = schema.map((attr: any) => ({
        attribute_key: String(attr.key ?? ''),
        attribute_value: existing.get(String(attr.key ?? '')) || '',
      }));
      return { ...prev, variants: next };
    });
  }, [selectedCategory]);

  function buildEmptyForm(): any {
    return {
      name: '',
      category_id: categories[0]?.id ?? '',
      subcategory_id: '',
      description: '',
      image: '',
      duration: '',
      worker_count: '',
      rate_type: '',
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
    setShowModal(true);
  }

  function openCreateCategory() {
    setEditingCategory(null);
    setCategoryForm({ name: '', description: '', image: '', variant_schema: [] });
    setCategoryFormError(null);
    setShowCategoryModal(true);
  }

  // Edits whichever category is currently selected in the service form.
  function openEditCategory() {
    const category = categories.find((c) => c.id === Number(form.category_id));
    if (!category) return;
    setEditingCategory(category);
    setCategoryForm({
      name: category.name,
      description: category.description ?? '',
      image: category.image ?? '',
      variant_schema: Array.isArray(category.variant_schema) ? category.variant_schema : [],
    });
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
      const res = await apiFetch(
        editingCategory ? `/api/catalog/categories/${editingCategory.id}` : '/api/catalog/categories',
        {
          method: editingCategory ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: categoryForm.name.trim(),
            description: categoryForm.description.trim() || null,
            image: categoryForm.image || null,
            sort_order: editingCategory?.sort_order ?? 0,
            variant_schema: categoryForm.variant_schema,
          }),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Failed to save category.');

      setShowCategoryModal(false);
      setEditingCategory(null);
      setCategoryForm({ name: '', description: '', image: '', variant_schema: [] });
      await fetchCategories();
      setForm((prev: any) => ({ ...prev, category_id: editingCategory?.id ?? json.id }));
    } catch (err) {
      setCategoryFormError(err instanceof Error ? err.message : 'Failed to save category.');
    } finally {
      setSavingCategory(false);
    }
  }

  function openCreateSubcategory() {
    setEditingSubcategory(null);
    setSubcategoryForm({
      name: '',
      description: '',
      image: '',
      sort_order: String(subcategoriesForCategory.length + 1),
      is_addon: false,
    });
    setSubcategoryFormError(null);
    setShowSubcategoryModal(true);
  }

  // Edits whichever subcategory is currently selected in the service form.
  function openEditSubcategory() {
    const subcategory = subcategories.find((s) => s.id === Number(form.subcategory_id));
    if (!subcategory) return;
    setEditingSubcategory(subcategory);
    setSubcategoryForm({
      name: subcategory.name,
      description: subcategory.description ?? '',
      image: subcategory.image ?? '',
      sort_order: String(subcategory.sort_order ?? 0),
      is_addon: Boolean(subcategory.is_addon),
    });
    setSubcategoryFormError(null);
    setShowSubcategoryModal(true);
  }

  async function handleSaveSubcategory(e: React.FormEvent) {
    e.preventDefault();
    if (!subcategoryForm.name.trim()) {
      setSubcategoryFormError('Subcategory name is required.');
      return;
    }
    const categoryId = editingSubcategory?.category_id ?? Number(form.category_id);
    if (!categoryId) {
      setSubcategoryFormError('Pick a category first.');
      return;
    }
    setSavingSubcategory(true);
    setSubcategoryFormError(null);

    try {
      const res = await apiFetch(
        editingSubcategory ? `/api/catalog/subcategories/${editingSubcategory.id}` : '/api/catalog/subcategories',
        {
          method: editingSubcategory ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category_id: categoryId,
            name: subcategoryForm.name.trim(),
            description: subcategoryForm.description.trim() || null,
            image: subcategoryForm.image || null,
            sort_order: Number(subcategoryForm.sort_order) || 0,
            is_addon: subcategoryForm.is_addon,
          }),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Failed to save subcategory.');

      setShowSubcategoryModal(false);
      setEditingSubcategory(null);
      await fetchSubcategories();
      setForm((prev: any) => ({ ...prev, subcategory_id: editingSubcategory?.id ?? json.id }));
    } catch (err) {
      setSubcategoryFormError(err instanceof Error ? err.message : 'Failed to save subcategory.');
    } finally {
      setSavingSubcategory(false);
    }
  }

  async function openEdit(service: CatalogService) {
    setEditingService(service);
    setFormError(null);
    try {
      const res = await apiFetch(`/api/catalog/services/${service.id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to load service detail.');
      const detail = json.data;
      setForm({
        name: detail.name,
        category_id: detail.category_id,
        subcategory_id: detail.subcategory_id ?? '',
        description: detail.description ?? '',
        image: detail.image ?? '',
        duration: detail.duration ?? '',
        worker_count: detail.worker_count ?? '',
        rate_type: detail.rate_type ?? '',
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
      subcategory_id: form.subcategory_id ? Number(form.subcategory_id) : null,
      description: form.description || null,
      image: form.image || null,
      worker_count: form.worker_count ? Number(form.worker_count) : null,
      rate_type: form.rate_type || null,
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
          { label: 'Categories', value: categories.length, icon: Tag, color: 'bg-terracotta' },
          { label: 'Subcategories', value: subcategories.length, icon: Layers, color: 'bg-terracotta' },
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
            <p className="text-sm text-warmgrey">{query ? 'No catalog services match your search.' : 'No catalog services yet.'}</p>
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
                        <p className="text-[11px] text-warmgrey mt-0.5">
                          {service.category}
                          {service.subcategory ? ` · ${service.subcategory}` : ' · Unassigned'}
                        </p>
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
                      <div className="flex items-center gap-2">
                        {form.category_id && (
                          <button
                            type="button"
                            onClick={openEditCategory}
                            className="text-[11px] font-semibold text-warmgrey hover:text-terracotta"
                          >
                            Edit
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={openCreateCategory}
                          className="text-[11px] font-semibold text-terracotta hover:text-accent-700"
                        >
                          + Add category
                        </button>
                      </div>
                    </div>
                    <select
                      value={form.category_id || ''}
                      onChange={(e) =>
                        // Changing category invalidates the current subcategory.
                        setForm((p: any) => ({ ...p, category_id: Number(e.target.value), subcategory_id: '' }))
                      }
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
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-warmgrey">Subcategory</label>
                      <div className="flex items-center gap-2">
                        {form.subcategory_id && (
                          <button
                            type="button"
                            onClick={openEditSubcategory}
                            className="text-[11px] font-semibold text-warmgrey hover:text-terracotta"
                          >
                            Edit
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={openCreateSubcategory}
                          disabled={!form.category_id}
                          className="text-[11px] font-semibold text-terracotta hover:text-accent-700 disabled:text-warmgrey disabled:cursor-not-allowed"
                        >
                          + Add subcategory
                        </button>
                      </div>
                    </div>
                    <select
                      value={form.subcategory_id || ''}
                      onChange={(e) => setForm((p: any) => ({ ...p, subcategory_id: e.target.value }))}
                      className={inputCls}
                    >
                      <option value="">Unassigned</option>
                      {subcategoriesForCategory.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-warmgrey mt-1">
                      Unassigned services are hidden from the storefront drill-down.
                    </p>
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
                    <ImageUploadField
                      value={form.image || ''}
                      name={form.name || ''}
                      onChange={(path) => setForm((p: any) => ({ ...p, image: path }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-warmgrey mb-1.5">Duration</label>
                    <input
                      type="text"
                      value={form.duration || ''}
                      onChange={(e) => setForm((p: any) => ({ ...p, duration: e.target.value }))}
                      className={inputCls}
                      placeholder="e.g. 60 mins, 2 hours"
                    />
                  </div>
                  {/* Shown under each option in the storefront variant picker
                      as "1 worker · day rate". */}
                  <div>
                    <label className="block text-xs font-semibold text-warmgrey mb-1.5">Workers</label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={form.worker_count || ''}
                      onChange={(e) => setForm((p: any) => ({ ...p, worker_count: e.target.value }))}
                      className={inputCls}
                      placeholder="e.g. 1"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-warmgrey mb-1.5">Rate basis</label>
                    <select
                      value={form.rate_type || ''}
                      onChange={(e) => setForm((p: any) => ({ ...p, rate_type: e.target.value }))}
                      className={inputCls}
                    >
                      <option value="">Not specified</option>
                      {rateTypeOptions.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
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

                  {rule.strategy === 'tiered' && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-warmgrey">Tiers</p>
                      {(rule.params.tiers || []).map((tier: any, index: number) => (
                        <div key={index} className="grid grid-cols-3 gap-3 items-end">
                          <div>
                            <label className="block text-[10px] text-warmgrey mb-1">Up to (units)</label>
                            <input
                              type="number"
                              min="1"
                              value={tier.up_to || ''}
                              onChange={(e) => {
                                const tiers = [...(rule.params.tiers || [])];
                                tiers[index] = { ...tiers[index], up_to: Number(e.target.value) };
                                updatePricingField('params.tiers', tiers);
                              }}
                              className={inputCls}
                              placeholder="e.g. 2"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-warmgrey mb-1">Total price</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={tier.amount || ''}
                              onChange={(e) => {
                                const tiers = [...(rule.params.tiers || [])];
                                tiers[index] = { ...tiers[index], amount: Number(e.target.value) };
                                updatePricingField('params.tiers', tiers);
                              }}
                              className={inputCls}
                              placeholder="e.g. 50"
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const tiers = (rule.params.tiers || []).filter((_: any, i: number) => i !== index);
                                updatePricingField('params.tiers', tiers);
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
                          const tiers = [...(rule.params.tiers || []), { up_to: '', amount: '' }];
                          updatePricingField('params.tiers', tiers);
                        }}
                        className="text-xs font-semibold text-terracotta hover:text-accent-700"
                      >
                        + Add tier
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
                    {Array.isArray(selectedCategory?.variant_schema) ? (
                      selectedCategory.variant_schema.map((attr: any, index: number) => {
                        const value = (form.variants || [])[index]?.attribute_value || '';
                        if (attr.type === 'select') {
                          const options = String(attr.options || '')
                            .split(',')
                            .map((s: string) => s.trim())
                            .filter(Boolean);
                          return (
                            <div key={index} className="space-y-1">
                              <label className="block text-[10px] text-warmgrey">{attr.label || attr.key}</label>
                              <select
                                value={value}
                                onChange={(e) => setVariant(index, 'attribute_value', e.target.value)}
                                className={inputCls}
                              >
                                <option value="">Select…</option>
                                {options.map((opt: string) => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            </div>
                          );
                        }
                        const inputType = attr.type === 'number' ? 'number' : 'text';
                        return (
                          <div key={index} className="space-y-1">
                            <label className="block text-[10px] text-warmgrey">{attr.label || attr.key}</label>
                            <input
                              type={inputType}
                              value={value}
                              onChange={(e) => setVariant(index, 'attribute_value', e.target.value)}
                              className={inputCls}
                              placeholder={String(attr.label || attr.key)}
                            />
                          </div>
                        );
                      })
                    ) : (
                      <>
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
                      </>
                    )}
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
                  <h2 className="text-base font-bold text-charcoal">{editingCategory ? 'Edit Category' : 'Add Category'}</h2>
                  <p className="text-xs text-warmgrey mt-0.5">{editingCategory ? 'Update catalog category' : 'New catalog category'}</p>
                </div>
                <button
                  onClick={() => { setShowCategoryModal(false); setEditingCategory(null); }}
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
                <div>
                  <label className="block text-xs font-semibold text-warmgrey mb-1.5">Image</label>
                  <ImageUploadField
                    value={categoryForm.image}
                    name={categoryForm.name}
                    onChange={(path) => setCategoryForm((p) => ({ ...p, image: path }))}
                  />
                </div>

                <div>
                  <p className="text-xs font-semibold text-warmgrey uppercase tracking-wide mb-2">Variant schema</p>
                  <div className="space-y-2">
                    {categoryForm.variant_schema.map((attr: any, index: number) => (
                      <div key={index} className="grid grid-cols-6 gap-2 items-end">
                        <div className="col-span-1">
                          <input
                            type="text"
                            value={attr.key || ''}
                            onChange={(e) => {
                              const schema = [...categoryForm.variant_schema];
                              schema[index] = { ...schema[index], key: e.target.value };
                              setCategoryForm((p) => ({ ...p, variant_schema: schema }));
                            }}
                            className={inputCls}
                            placeholder="key"
                          />
                        </div>
                        <div className="col-span-2">
                          <input
                            type="text"
                            value={attr.label || ''}
                            onChange={(e) => {
                              const schema = [...categoryForm.variant_schema];
                              schema[index] = { ...schema[index], label: e.target.value };
                              setCategoryForm((p) => ({ ...p, variant_schema: schema }));
                            }}
                            className={inputCls}
                            placeholder="label"
                          />
                        </div>
                        <div className="col-span-1">
                          <select
                            value={attr.type || 'text'}
                            onChange={(e) => {
                              const schema = [...categoryForm.variant_schema];
                              schema[index] = { ...schema[index], type: e.target.value };
                              setCategoryForm((p) => ({ ...p, variant_schema: schema }));
                            }}
                            className={inputCls}
                          >
                            <option value="text">Text</option>
                            <option value="select">Select</option>
                            <option value="number">Number</option>
                          </select>
                        </div>
                        <div className={attr.type === 'select' ? 'col-span-1' : 'col-span-1 opacity-50'}>
                          <input
                            type="text"
                            value={attr.options || ''}
                            disabled={attr.type !== 'select'}
                            onChange={(e) => {
                              const schema = [...categoryForm.variant_schema];
                              schema[index] = { ...schema[index], options: e.target.value };
                              setCategoryForm((p) => ({ ...p, variant_schema: schema }));
                            }}
                            className={inputCls}
                            placeholder="opt1, opt2"
                          />
                        </div>
                        <div className="col-span-1">
                          <button
                            type="button"
                            onClick={() => {
                              const schema = categoryForm.variant_schema.filter((_: any, i: number) => i !== index);
                              setCategoryForm((p) => ({ ...p, variant_schema: schema }));
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
                      onClick={() =>
                        setCategoryForm((p) => ({
                          ...p,
                          variant_schema: [...p.variant_schema, { key: '', label: '', type: 'text', options: '' }],
                        }))
                      }
                      className="text-xs font-semibold text-terracotta hover:text-accent-700"
                    >
                      + Add attribute
                    </button>
                  </div>
                </div>

                {categoryFormError && <p className="text-xs text-rosewood">{categoryFormError}</p>}
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => { setShowCategoryModal(false); setEditingCategory(null); }}
                    className="px-4 py-2 text-sm font-semibold text-warmgrey bg-accent-50 hover:bg-lightstone rounded-xl transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingCategory}
                    className="px-5 py-2 text-sm font-bold bg-terracotta hover:bg-accent-700 text-white rounded-xl shadow-sm shadow-soft transition disabled:opacity-60"
                  >
                    {savingCategory ? 'Saving…' : editingCategory ? 'Save Changes' : 'Add Category'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </ModalPortal>
      )}

      {showSubcategoryModal && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/20 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm border border-lightstone overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-lightstone">
                <div>
                  <h2 className="text-base font-bold text-charcoal">{editingSubcategory ? 'Edit Subcategory' : 'Add Subcategory'}</h2>
                  <p className="text-xs text-warmgrey mt-0.5">Under {editingSubcategory ? categories.find((c) => c.id === editingSubcategory.category_id)?.name ?? 'category' : selectedCategory?.name ?? 'category'}</p>
                </div>
                <button
                  onClick={() => { setShowSubcategoryModal(false); setEditingSubcategory(null); }}
                  className="p-1.5 hover:bg-accent-50 rounded-lg transition"
                >
                  <X size={16} className="text-warmgrey" />
                </button>
              </div>
              <form onSubmit={handleSaveSubcategory} className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-warmgrey mb-1.5">Name *</label>
                  <input
                    type="text"
                    value={subcategoryForm.name}
                    onChange={(e) => setSubcategoryForm((p) => ({ ...p, name: e.target.value }))}
                    className={inputCls}
                    placeholder="e.g. Weekly Package"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-warmgrey mb-1.5">Description</label>
                  <textarea
                    rows={2}
                    value={subcategoryForm.description}
                    onChange={(e) => setSubcategoryForm((p) => ({ ...p, description: e.target.value }))}
                    className={clsx(inputCls, 'resize-none')}
                    placeholder="Shown under the title on the storefront…"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-warmgrey mb-1.5">Image</label>
                  <ImageUploadField
                    value={subcategoryForm.image}
                    name={subcategoryForm.name}
                    onChange={(path) => setSubcategoryForm((p) => ({ ...p, image: path }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-warmgrey mb-1.5">Sort order</label>
                  <input
                    type="number"
                    value={subcategoryForm.sort_order}
                    onChange={(e) => setSubcategoryForm((p) => ({ ...p, sort_order: e.target.value }))}
                    className={inputCls}
                  />
                </div>
                <label className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={subcategoryForm.is_addon}
                    onChange={(e) => setSubcategoryForm((p) => ({ ...p, is_addon: e.target.checked }))}
                    className="mt-0.5 accent-terracotta"
                  />
                  <span>
                    <span className="block text-xs font-semibold text-charcoal">Add-on group</span>
                    <span className="block text-xs text-warmgrey">
                      Services here are hidden from the storefront grid and offered in the
                      Add-ons panel of other bookings in this category.
                    </span>
                  </span>
                </label>

                {subcategoryFormError && <p className="text-xs text-rosewood">{subcategoryFormError}</p>}
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => { setShowSubcategoryModal(false); setEditingSubcategory(null); }}
                    className="px-4 py-2 text-sm font-semibold text-warmgrey bg-accent-50 hover:bg-lightstone rounded-xl transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingSubcategory}
                    className="px-5 py-2 text-sm font-bold bg-terracotta hover:bg-accent-700 text-white rounded-xl shadow-sm shadow-soft transition disabled:opacity-60"
                  >
                    {savingSubcategory ? 'Saving…' : editingSubcategory ? 'Save Changes' : 'Add Subcategory'}
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
