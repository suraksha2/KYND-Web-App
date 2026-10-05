import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, X, Upload, ChevronLeft, Eye, AlertTriangle, Package, Tag } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import ModalPortal from '@/components/ModalPortal';
import { apiFetch, serviceImageUrl } from '@/lib/api';
import {
  previewBookingBehavior,
  parseDurationMinutes,
  formatHours,
  HOUSE_RE,
  type PreviewMode,
  type PreviewSibling,
} from '@/lib/bookingPreview';

type CatalogCategory = {
  id: number;
  name: string;
  description: string | null;
  image: string | null;
  sort_order: number;
  variant_schema: any;
};

// A suggested home size for the storefront's house-cleaning size/hours/
// cleaners picker (HOME_SIZES in src/pages/ServiceDetail.jsx). Only read when
// the subcategory has 2+ services named "One-Time Cleaning X hr"; otherwise
// unused. Empty/unset on the subcategory falls back to the storefront's
// built-in Studio/1BR/2BR/3BR/4BR+ defaults.
type HomeSize = { label: string; hours: number; description?: string };

const DEFAULT_HOME_SIZES: HomeSize[] = [
  { label: 'Studio', hours: 2, description: 'A studio' },
  { label: '1BR', hours: 2.5, description: 'A 1-bedroom' },
  { label: '2BR', hours: 3, description: 'A 2-bedroom' },
  { label: '3BR', hours: 4, description: 'A 3-bedroom' },
  { label: '4BR+', hours: 4, description: 'A 4-bedroom' },
];

// Office-cleaning contract pricing for the storefront's office picker
// (OfficePicker + OfficeRecurringPanel in src/pages/ServiceDetail.jsx). Only
// read when the subcategory's Booking style resolves to "office_cleaning".
// `threeWeek`/`daily` are the storefront's OFFICE_PLANS keys — null on a size
// row is a "By quote" cell (renders as a Contact-us card), and `dedicated`
// rows are always quote-only.
type OfficeSize = { id: string; label: string; threeWeek: number | null; daily: number | null };
type OfficeDedicated = { id: string; title: string; subtitle: string; range: string };
type OfficePricing = {
  hourlyRate: number | null; // one-time visits: $/hr per cleaner
  hours: number[]; // "Hours per visit" pill options
  sizes: OfficeSize[];
  dedicated: OfficeDedicated[];
};

// Mirrors DEFAULT_OFFICE_PRICING in src/pages/ServiceDetail.jsx — the values
// the storefront uses when this is unset.
const DEFAULT_OFFICE_PRICING: OfficePricing = {
  hourlyRate: 28,
  hours: [2, 3, 4, 6, 8],
  sizes: [
    { id: '1-2k', label: '1,000–2,000 sqft', threeWeek: 450, daily: 550 },
    { id: '2-3k', label: '2,001–3,000 sqft', threeWeek: 650, daily: 750 },
    { id: '3-4k', label: '3,001–4,000 sqft', threeWeek: 850, daily: 1100 },
    { id: '4-5k', label: '4,001–5,000 sqft', threeWeek: null, daily: 1250 },
    { id: '5-7k', label: '5,001–7,000 sqft', threeWeek: null, daily: 1520 },
    { id: '7k+', label: '7,001 sqft onwards', threeWeek: null, daily: null },
  ],
  dedicated: [
    { id: 'dedicatedWeekday', title: 'Dedicated cleaner, Mon–Fri', subtitle: 'Full-time, stationed onsite', range: 'S$2,900–S$4,200/mo' },
    { id: 'dedicatedFull', title: 'Dedicated cleaner, Mon–Sun', subtitle: 'Full-time, incl. public holidays', range: 'S$3,800–S$4,800/mo' },
  ],
};

// Form fields are strings while being edited (same convention as the rest of
// this form, e.g. sort_order); converted back to numbers on save.
type OfficePricingForm = {
  hourlyRate: string;
  hours: string; // comma-separated, e.g. "2, 3, 4, 6, 8"
  sizes: { id: string; label: string; threeWeek: string; daily: string }[];
  dedicated: OfficeDedicated[];
};

function toOfficePricingForm(p: OfficePricing): OfficePricingForm {
  return {
    hourlyRate: p.hourlyRate == null ? '' : String(p.hourlyRate),
    hours: (p.hours ?? []).join(', '),
    sizes: (p.sizes ?? []).map((s) => ({
      id: s.id ?? '',
      label: s.label ?? '',
      threeWeek: s.threeWeek == null ? '' : String(s.threeWeek),
      daily: s.daily == null ? '' : String(s.daily),
    })),
    dedicated: (p.dedicated ?? []).map((d) => ({
      id: d.id ?? '',
      title: d.title ?? '',
      subtitle: d.subtitle ?? '',
      range: d.range ?? '',
    })),
  };
}

function fromOfficePricingForm(f: OfficePricingForm): OfficePricing {
  const money = (v: string) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  return {
    hourlyRate: money(f.hourlyRate),
    hours: f.hours
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0),
    sizes: f.sizes
      .filter((s) => s.label.trim())
      .map((s, i) => ({
        id: s.id.trim() || `s${i}`,
        label: s.label.trim(),
        threeWeek: money(s.threeWeek),
        daily: money(s.daily),
      })),
    dedicated: f.dedicated
      .filter((d) => d.title.trim())
      .map((d, i) => ({
        id: d.id.trim() || `d${i}`,
        title: d.title.trim(),
        subtitle: d.subtitle.trim(),
        range: d.range.trim(),
      })),
  };
}

type CatalogSubcategory = {
  id: number;
  category_id: number;
  name: string;
  description: string | null;
  image: string | null;
  hero_image: string | null;
  hero_image_focus: string | null;
  is_addon: boolean;
  home_sizes: HomeSize[] | null;
  office_pricing: OfficePricing | null;
  booking_behavior: string | null;
  sort_order: number;
  service_count: number;
  placements: { category_id: number; sort_order: number }[];
};

type PricingRule = {
  id?: number;
  strategy: 'flat' | 'hourly' | 'per_unit' | 'tiered' | 'custom_quote';
  params: any;
};

// Kept verbatim on edit and resubmitted — the storefront ignores these, but
// the PUT endpoint replaces the rows wholesale so they must round-trip.
type BookingMode = {
  mode: 'on_demand' | 'scheduled' | 'recurring';
  min_lead_time_hours: number;
  blackout_dates?: any[];
  recurrence_frequency?: string | null;
  recurrence_discount_pct?: number | null;
};

type Variant = {
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
  is_picker_option: boolean;
  default_partner_cost: number | null;
  markup_pct_override: number | null;
  pricing_strategy: string | null;
  pricing_params: any;
};

const DEFAULT_MARKUP_PCT = 30;

const statusOptions: { value: CatalogService['status']; label: string }[] = [
  { value: 'live', label: 'Live' },
  { value: 'pending_rates', label: 'Pending rates' },
  { value: 'paused', label: 'Paused' },
];

// Matches BOOKING_BEHAVIORS in backend/db/src/routes/catalog.ts and the
// `explicit` modes in src/pages/ServiceDetail.jsx.
const BOOKING_BEHAVIOR_OPTIONS = [
  { value: '', label: 'Auto — infer from service names' },
  { value: 'simple_list', label: 'Simple list' },
  { value: 'duration_list', label: 'Duration picker' },
  { value: 'multi_select', label: 'Multi-select (tick several)' },
  { value: 'room_type', label: 'Unit / room type list' },
  { value: 'house_cleaning', label: 'House cleaning (size · hours · cleaners)' },
  { value: 'office_cleaning', label: 'Office cleaning picker' },
  { value: 'wellness_session', label: 'Wellness sessions (duration + plan)' },
];

const BEHAVIOR_SHORT_LABELS: Record<string, string> = {
  simple_list: 'Simple list',
  duration_list: 'Duration picker',
  multi_select: 'Multi-select',
  room_type: 'Unit types',
  house_cleaning: 'House cleaning',
  office_cleaning: 'Office cleaning',
  wellness_session: 'Wellness sessions',
};

const rateTypeOptions = [
  { value: 'day_rate', label: 'Day rate' },
  { value: 'evening_rate', label: 'Evening rate' },
  { value: 'per_unit', label: 'Per unit' },
  { value: 'per_job', label: 'Per job' },
  { value: 'package', label: 'Package price' },
];

const RATE_LABELS: Record<string, string> = Object.fromEntries(
  rateTypeOptions.map((r) => [r.value, r.label.toLowerCase()])
);

const inputCls =
  'w-full px-3 py-2 text-sm bg-gray-50 border border-lightstone rounded-xl focus:outline-none focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta transition placeholder:text-warmgrey';

// ---------------------------------------------------------------------------
// Storefront-faithful helpers — keep these aligned with
// src/lib/catalogServices.js and src/pages/ServiceDetail.jsx.
// ---------------------------------------------------------------------------

/** Customer-facing list price: flat rule wins, else partner cost x markup. */
function sellPrice(s: CatalogService): number | null {
  if (s.pricing_strategy === 'flat') {
    const amount = Number(s.pricing_params?.amount);
    if (Number.isFinite(amount) && amount > 0) return amount;
  }
  if (s.pricing_strategy === 'custom_quote') return null;
  const cost = s.default_partner_cost !== null ? Number(s.default_partner_cost) : null;
  if (cost === null || Number.isNaN(cost)) return null;
  return Math.round(cost * (1 + (s.markup_pct_override ?? DEFAULT_MARKUP_PCT) / 100));
}

/** "2 workers · day rate" — the subline under each storefront option. */
function serviceMeta(s: CatalogService) {
  const parts: string[] = [];
  if (s.worker_count) parts.push(`${s.worker_count} worker${s.worker_count > 1 ? 's' : ''}`);
  if (s.rate_type) parts.push(RATE_LABELS[s.rate_type] ?? s.rate_type.replace(/_/g, ' '));
  return parts.join(' · ');
}

// Move-out tiers are labelled by unit ("2BR (600-799 sqft)") — same stripping
// as `roomLabel` in ServiceDetail.jsx.
const roomLabel = (name = '') =>
  name
    .replace(/\s*move[\s-]?out\b/i, '')
    .replace(/,?\s*condo\b/i, '')
    .replace(/\(\s*\)/, '')
    .replace(/\s+/g, ' ')
    .trim() || name;

const WEEKLY_RE = /^(\d+(?:\.\d+)?)\s*Hours?\/Visit\s*-\s*(\d+)\s*Times?\s+per\s+Week$/i;
const parseWeekly = (name = '') => {
  const m = name.match(WEEKLY_RE);
  return m ? { hours: Number(m[1]), times: Number(m[2]) } : null;
};

/** The option label a customer sees for this service under `mode`. */
function optionLabel(s: CatalogService, mode?: PreviewMode): string {
  const mins = parseDurationMinutes(s.duration);
  switch (mode) {
    case 'duration_list':
    case 'wellness_session':
      return mins ? formatHours(mins) : s.name;
    case 'house_cleaning':
      return mins ? `${formatHours(mins)} per visit` : s.name;
    case 'room_type':
      return roomLabel(s.name);
    default: {
      const weekly = parseWeekly(s.name);
      return weekly ? `${weekly.hours} hr × ${weekly.times}/week` : s.name;
    }
  }
}

/** Storefront option order: duration pickers sort by length, everything else
 *  by price then name (sortedVariants in ServiceDetail.jsx). */
function sortServices(list: CatalogService[], mode?: PreviewMode) {
  const arr = [...list];
  if (mode === 'duration_list' || mode === 'wellness_session' || mode === 'house_cleaning') {
    return arr.sort(
      (a, b) => (parseDurationMinutes(a.duration) || 0) - (parseDurationMinutes(b.duration) || 0)
    );
  }
  return arr.sort(
    (a, b) => (sellPrice(a) ?? Infinity) - (sellPrice(b) ?? Infinity) || a.name.localeCompare(b.name)
  );
}

const STATUS_CFG: Record<CatalogService['status'], { cls: string; dot: string; label: string }> = {
  live: { cls: 'bg-sage/10 text-sage ring-1 ring-sage/20', dot: 'bg-sage', label: 'Live' },
  pending_rates: { cls: 'bg-amber-100 text-amber-700 ring-1 ring-amber-500/20', dot: 'bg-amber-500', label: 'Pending rates' },
  paused: { cls: 'bg-dustyrose/10 text-rosewood ring-1 ring-dustyrose/20', dot: 'bg-dustyrose', label: 'Paused' },
};

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

// The 9 CSS object-position keyword pairs the backend accepts (see
// HERO_IMAGE_FOCUS_VALUES in backend/db/src/routes/catalog.ts). Null/'' means
// "center center", the default.
const FOCUS_POSITIONS: { value: string; label: string }[] = [
  { value: 'left top', label: 'Top left' },
  { value: 'center top', label: 'Top' },
  { value: 'right top', label: 'Top right' },
  { value: 'left center', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right center', label: 'Right' },
  { value: 'left bottom', label: 'Bottom left' },
  { value: 'center bottom', label: 'Bottom' },
  { value: 'right bottom', label: 'Bottom right' },
];

// Lets an admin pick which part of a hero photo to keep in frame. The
// storefront renders this image with object-cover across several different
// aspect ratios (mobile -> desktop; see ServiceHero in
// src/pages/ServiceDetail.jsx), so a single center crop can cut off the
// subject on some screens — this focal point becomes that image's
// object-position everywhere it's shown.
function ImageFocusPicker({
  image,
  value,
  onChange,
}: {
  image: string;
  value: string;
  onChange: (focus: string) => void;
}) {
  if (!image) return null;
  const focus = value || 'center';
  return (
    <div className="mt-2">
      <p className="text-xs font-semibold text-warmgrey mb-1.5">
        Focal point <span className="font-normal">(what stays in frame when cropped for mobile vs desktop)</span>
      </p>
      <div className="relative w-40 aspect-video rounded-lg overflow-hidden border border-lightstone">
        <img
          src={serviceImageUrl(image) ?? ''}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          style={{ objectPosition: focus }}
        />
        <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
          {FOCUS_POSITIONS.map((p) => (
            <button
              key={p.value}
              type="button"
              title={p.label}
              onClick={() => onChange(p.value)}
              className="group flex items-center justify-center"
            >
              <span
                className={clsx(
                  'w-2.5 h-2.5 rounded-full border border-white transition',
                  focus === p.value ? 'bg-terracotta scale-125' : 'bg-white/40 group-hover:bg-white/80'
                )}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Tile with image/initials + name + subtitle, mirroring the storefront's
// TaxonomyTile. `action` renders a small corner button (edit) without
// triggering the drill-down.
function Tile({
  image,
  name,
  subtitle,
  chips,
  onClick,
  action,
}: {
  image?: string | null;
  name: string;
  subtitle?: string;
  chips?: React.ReactNode;
  onClick?: () => void;
  action?: React.ReactNode;
}) {
  const inner = (
    <>
      {action && <div className="absolute top-2 right-2 z-10">{action}</div>}
      <div className="relative w-11 h-11 md:w-14 md:h-14 shrink-0 rounded-xl bg-warmlinen grid place-items-center overflow-hidden">
        {image ? (
          <img src={serviceImageUrl(image) ?? ''} alt={name} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <span className="text-sm font-extrabold text-terracotta">{name.substring(0, 2).toUpperCase()}</span>
        )}
      </div>
      <div className="mt-2 flex-1 flex flex-col">
        <div className="text-sm font-semibold text-charcoal leading-snug line-clamp-2">{name}</div>
        {chips && <div className="mt-1.5 flex flex-wrap gap-1">{chips}</div>}
        {subtitle && <div className="mt-auto pt-2 text-xs text-warmgrey">{subtitle}</div>}
      </div>
    </>
  );
  const cls = 'group relative flex flex-col rounded-2xl bg-white border border-lightstone p-3 md:p-4 text-left transition hover:shadow-soft hover:border-terracotta/40';
  // A div with role=button — the corner action is itself a button and nested
  // <button> elements aren't valid.
  return onClick ? (
    <div role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => e.key === 'Enter' && onClick()} className={clsx(cls, 'cursor-pointer')}>
      {inner}
    </div>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

function AddTile({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-lightstone p-3 md:p-4 text-warmgrey hover:border-terracotta/50 hover:text-terracotta transition min-h-[120px]"
    >
      <Plus size={18} />
      <span className="text-xs font-semibold">{label}</span>
    </button>
  );
}

const emptyBookingModes = (): BookingMode[] =>
  (['on_demand', 'scheduled', 'recurring'] as const).map((mode) => ({
    mode,
    min_lead_time_hours: 0,
    blackout_dates: [],
    recurrence_frequency: null,
    recurrence_discount_pct: null,
  }));

export default function CatalogServicesPage() {
  const [services, setServices] = useState<CatalogService[]>([]);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [subcategories, setSubcategories] = useState<CatalogSubcategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Service modal
  const [showModal, setShowModal] = useState(false);
  const [editingService, setEditingService] = useState<CatalogService | null>(null);
  const [form, setForm] = useState<any>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Delete confirmations
  const [deleteServiceId, setDeleteServiceId] = useState<number | null>(null);
  const [deleteSubcategory, setDeleteSubcategory] = useState<CatalogSubcategory | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Category modal
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CatalogCategory | null>(null);
  const [categoryForm, setCategoryForm] = useState<{
    name: string;
    description: string;
    image: string;
    sort_order: string;
    variant_schema: any[];
  }>({ name: '', description: '', image: '', sort_order: '0', variant_schema: [] });
  const [categoryFormError, setCategoryFormError] = useState<string | null>(null);
  const [savingCategory, setSavingCategory] = useState(false);

  // Subcategory modal
  const [showSubcategoryModal, setShowSubcategoryModal] = useState(false);
  const [editingSubcategory, setEditingSubcategory] = useState<CatalogSubcategory | null>(null);
  const [subcategoryForm, setSubcategoryForm] = useState<{
    category_id: number | '';
    name: string;
    description: string;
    image: string;
    hero_image: string;
    hero_image_focus: string;
    sort_order: string;
    is_addon: boolean;
    booking_behavior: string;
    home_sizes: HomeSize[];
    office_pricing: OfficePricingForm | null;
  }>({
    category_id: '',
    name: '',
    description: '',
    image: '',
    hero_image: '',
    hero_image_focus: '',
    sort_order: '0',
    is_addon: false,
    booking_behavior: '',
    home_sizes: [],
    office_pricing: null,
  });
  const [subcategoryFormError, setSubcategoryFormError] = useState<string | null>(null);
  const [savingSubcategory, setSavingSubcategory] = useState(false);

  // Drill-down mirrors the storefront: ?category=<id>&subcategory=<id>.
  // ?q= (header search) shows a flat result list at any level.
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q')?.toLowerCase().trim() ?? '';
  const categoryParam = Number(searchParams.get('category')) || null;
  const subcategoryParam = Number(searchParams.get('subcategory')) || null;
  const editParam = Number(searchParams.get('edit')) || null;

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
    try {
      const res = await apiFetch('/api/catalog/services');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to load catalog services.');
      setServices(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load catalog services.');
    }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchServices(), fetchSubcategories(), fetchCategories()]).finally(() =>
      setLoading(false)
    );
  }, []);

  // --- Drill-down state -----------------------------------------------------

  // Position of a subcategory inside a given category: its own sort_order at
  // home, or the placement's sort_order where it's also listed (same rule as
  // `sortIn` in the storefront's catalogCategories.js).
  const sortInCategory = (sub: CatalogSubcategory, catId: number) => {
    const placement = (sub.placements || []).find((p) => p.category_id === catId);
    return placement ? placement.sort_order : sub.sort_order;
  };

  const subsForCategory = (catId: number) =>
    subcategories
      .filter(
        (s) => s.category_id === catId || (s.placements || []).some((p) => p.category_id === catId)
      )
      .sort(
        (a, b) => sortInCategory(a, catId) - sortInCategory(b, catId) || a.name.localeCompare(b.name)
      );

  const activeCategory = categories.find((c) => c.id === categoryParam) ?? null;
  const activeSubcategories = activeCategory ? subsForCategory(activeCategory.id) : [];
  const activeSubcategory = activeSubcategories.find((s) => s.id === subcategoryParam) ?? null;
  // Add-on groups are managed from the Add-ons tab, not browsed as cards in
  // the catalog grid — the URL still resolves them so deep links keep working.
  const visibleSubcategories = activeSubcategories.filter((s) => !s.is_addon);

  const subServices = useMemo(
    () => (activeSubcategory ? services.filter((s) => s.subcategory_id === activeSubcategory.id) : []),
    [services, activeSubcategory]
  );

  // Services in this category with no subcategory — hidden from the storefront
  // drill-down, so they get their own list to be fixed.
  const unassignedServices = useMemo(
    () =>
      activeCategory && !activeSubcategory
        ? services.filter((s) => s.category_id === activeCategory.id && !s.subcategory_id)
        : [],
    [services, activeCategory, activeSubcategory]
  );

  // How this subcategory renders on the customer storefront — same rules as
  // ServiceDetail.jsx via src/lib/bookingPreview.ts. Index 0's
  // currentService* fields are ignored here; the banner only shows the mode.
  const subPreview = useMemo(() => {
    if (!activeCategory || !activeSubcategory || subServices.length === 0) return null;
    const siblings: PreviewSibling[] = subServices.map((s) => ({
      id: s.id,
      name: s.name,
      duration: s.duration,
      isPickerOption: Boolean(s.is_picker_option),
    }));
    return previewBookingBehavior(
      activeCategory.name,
      activeSubcategory.name,
      activeSubcategory.booking_behavior,
      siblings,
      0
    );
  }, [activeCategory, activeSubcategory, subServices]);

  const orderedSubServices = useMemo(
    () => sortServices(subServices, subPreview?.mode),
    [subServices, subPreview]
  );

  // Under the house-cleaning picker, which rows are actually hour options —
  // flagged services win; falling back to the "One-Time Cleaning" name rule.
  const hourOptionIds = useMemo(() => {
    if (subPreview?.mode !== 'house_cleaning') return new Set<number>();
    const flagged = subServices.filter((s) => s.is_picker_option);
    const source = flagged.length ? flagged : subServices.filter((s) => HOUSE_RE.test(s.name));
    return new Set(source.map((s) => s.id));
  }, [subServices, subPreview]);

  const searchResults = useMemo(() => {
    if (!query) return [];
    return services
      .filter((s) =>
        [s.name, s.category, s.subcategory ?? '', s.description ?? ''].some((t) =>
          t.toLowerCase().includes(query)
        )
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [services, query]);

  const setParam = (key: string, value: string | null) =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === null) next.delete(key);
      else next.set(key, value);
      if (key === 'category') next.delete('subcategory');
      return next;
    });
  const openCategory = (id: number) => setParam('category', String(id));
  const openSubcategory = (id: number) => setParam('subcategory', String(id));
  const goToCatalog = () => setParam('category', null);
  const goToCategory = () => setParam('subcategory', null);

  const isCleaningCategory = (categoryId: number | string | undefined) =>
    /cleaning/i.test(categories.find((c) => c.id === Number(categoryId))?.name || '');

  // --- Service form ---------------------------------------------------------

  function buildEmptyForm(categoryId: number | '', subcategoryId: number | ''): any {
    return {
      name: '',
      category_id: categoryId || (categories[0]?.id ?? ''),
      subcategory_id: subcategoryId || '',
      description: '',
      image: '',
      duration: '',
      worker_count: '',
      rate_type: '',
      status: 'pending_rates',
      is_picker_option: false,
      default_partner_cost: '',
      markup_pct_override: '',
      pricing_rules: [{ strategy: 'flat', params: { amount: '' } }],
      booking_modes: emptyBookingModes(),
      variants: [] as Variant[],
    };
  }

  function openCreateService() {
    setEditingService(null);
    setForm(buildEmptyForm(activeCategory?.id ?? '', activeSubcategory?.id ?? ''));
    setFormError(null);
    setShowModal(true);
  }

  async function openEditService(service: CatalogService) {
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
        is_picker_option: Boolean(detail.is_picker_option),
        default_partner_cost: detail.default_partner_cost ?? '',
        markup_pct_override: detail.markup_pct_override ?? '',
        pricing_rules: detail.pricing_rules?.length
          ? detail.pricing_rules.map((r: PricingRule) => ({
              ...r,
              params: typeof r.params === 'string' ? JSON.parse(r.params) : r.params,
            }))
          : [],
        booking_modes: detail.booking_modes ?? [],
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

  // Deep link `&edit=<serviceId>` opens the edit form straight away — the
  // pencil on the Add-ons tab uses it so it's one click to the form. The param
  // is consumed once the modal opens so re-clicking the pencil re-triggers it.
  useEffect(() => {
    if (!editParam) return;
    const svc = services.find((s) => s.id === editParam);
    if (!svc) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('edit');
        return next;
      },
      { replace: true }
    );
    openEditService(svc);
  }, [editParam, services]);

  // Price the way the storefront reads it (sellPrice): 'fixed' writes a flat
  // rule, 'markup' writes no rule so cost x (1+markup) applies, 'quote' writes
  // custom_quote. 'advanced' keeps an existing hourly/per-unit/tiered rule.
  type PriceMode = 'fixed' | 'markup' | 'quote' | 'advanced';
  const formRule: PricingRule | undefined = form.pricing_rules?.[0];
  const priceMode: PriceMode = !formRule
    ? 'markup'
    : formRule.strategy === 'flat'
      ? 'fixed'
      : formRule.strategy === 'custom_quote'
        ? 'quote'
        : 'advanced';

  function setPriceMode(mode: PriceMode) {
    setForm((prev: any) => {
      let rules: PricingRule[];
      switch (mode) {
        case 'fixed':
          rules = [{ strategy: 'flat', params: { amount: '' } }];
          break;
        case 'quote':
          rules = [{ strategy: 'custom_quote', params: {} }];
          break;
        case 'advanced':
          rules = [
            {
              strategy: 'hourly',
              params: { rate_schedule: [{ start: '08:00', end: '18:00', rate: '' }] },
            },
          ];
          break;
        default:
          rules = [];
      }
      return { ...prev, pricing_rules: rules };
    });
  }

  const selectedFormCategory = useMemo(
    () => categories.find((c) => c.id === Number(form?.category_id)),
    [categories, form?.category_id]
  );

  const subcategoriesForFormCategory = useMemo(
    () => (form?.category_id ? subsForCategory(Number(form.category_id)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [subcategories, form?.category_id]
  );

  const selectedFormSubcategory = useMemo(
    () => subcategories.find((s) => s.id === Number(form?.subcategory_id)),
    [subcategories, form?.subcategory_id]
  );

  // Live preview of the picker this service will render inside on the
  // storefront — the same inference ServiceDetail.jsx runs.
  const behaviorPreview = useMemo(() => {
    if (!form?.subcategory_id || !selectedFormSubcategory) return null;
    const siblings: PreviewSibling[] = services
      .filter((s) => s.subcategory_id === selectedFormSubcategory.id && s.id !== editingService?.id)
      .map((s) => ({
        id: s.id,
        name: s.name,
        duration: s.duration,
        isPickerOption: Boolean(s.is_picker_option),
      }));
    siblings.push({
      name: form.name || '',
      duration: form.duration || null,
      isPickerOption: Boolean(form.is_picker_option),
    });
    return previewBookingBehavior(
      selectedFormCategory?.name || '',
      selectedFormSubcategory.name,
      selectedFormSubcategory.booking_behavior,
      siblings,
      siblings.length - 1
    );
  }, [
    form?.subcategory_id,
    form?.name,
    form?.duration,
    form?.is_picker_option,
    services,
    selectedFormSubcategory,
    selectedFormCategory,
    editingService,
  ]);

  const formMode = behaviorPreview?.mode;
  const formCategoryIsCleaning = isCleaningCategory(form?.category_id);
  const formSubcategoryIsCleaning = isCleaningCategory(subcategoryForm.category_id);

  // Sync variant attributes to the selected category's schema (Advanced).
  useEffect(() => {
    const schema = selectedFormCategory?.variant_schema;
    if (!Array.isArray(schema) || !schema.length) return;
    setForm((prev: any) => {
      const existing = new Map(
        (prev.variants || []).map((v: Variant) => [v.attribute_key, v.attribute_value])
      );
      const next = schema.map((attr: any) => ({
        attribute_key: String(attr.key ?? ''),
        attribute_value: existing.get(String(attr.key ?? '')) || '',
      }));
      return { ...prev, variants: next };
    });
  }, [selectedFormCategory]);

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

  function buildPricingRules(): PricingRule[] {
    if (priceMode === 'markup') return [];
    if (!formRule) return [];
    if (priceMode === 'fixed' && !(Number(formRule.params?.amount) > 0)) {
      // A blank flat amount behaves exactly like cost + markup on the
      // storefront — store it that way rather than a dead rule.
      return [];
    }
    return [{ strategy: formRule.strategy, params: cleanParams(formRule.strategy, formRule.params) }];
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

    const payload = {
      ...form,
      subcategory_id: form.subcategory_id ? Number(form.subcategory_id) : null,
      description: form.description || null,
      image: form.image || null,
      worker_count: form.worker_count ? Number(form.worker_count) : null,
      rate_type: form.rate_type || null,
      default_partner_cost: form.default_partner_cost !== '' ? Number(form.default_partner_cost) : null,
      markup_pct_override: form.markup_pct_override !== '' ? Number(form.markup_pct_override) : null,
      pricing_rules: buildPricingRules(),
      booking_modes: form.booking_modes ?? [],
      variants: form.variants ?? [],
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
      await fetchServices();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save service.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteService() {
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

  // --- Category form --------------------------------------------------------

  function openCreateCategory() {
    setEditingCategory(null);
    setCategoryForm({
      name: '',
      description: '',
      image: '',
      sort_order: String(categories.length + 1),
      variant_schema: [],
    });
    setCategoryFormError(null);
    setShowCategoryModal(true);
  }

  function openEditCategory(category: CatalogCategory) {
    setEditingCategory(category);
    setCategoryForm({
      name: category.name,
      description: category.description ?? '',
      image: category.image ?? '',
      sort_order: String(category.sort_order ?? 0),
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
            sort_order: Number(categoryForm.sort_order) || 0,
            variant_schema: categoryForm.variant_schema,
          }),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Failed to save category.');

      setShowCategoryModal(false);
      setEditingCategory(null);
      await fetchCategories();
    } catch (err) {
      setCategoryFormError(err instanceof Error ? err.message : 'Failed to save category.');
    } finally {
      setSavingCategory(false);
    }
  }

  // --- Subcategory form -----------------------------------------------------

  function openCreateSubcategory(categoryId: number) {
    setEditingSubcategory(null);
    setSubcategoryForm({
      category_id: categoryId,
      name: '',
      description: '',
      image: '',
      hero_image: '',
      hero_image_focus: '',
      sort_order: String(subsForCategory(categoryId).length + 1),
      is_addon: false,
      booking_behavior: '',
      home_sizes: [],
      office_pricing: null,
    });
    setSubcategoryFormError(null);
    setShowSubcategoryModal(true);
  }

  function openEditSubcategory(subcategory: CatalogSubcategory) {
    setEditingSubcategory(subcategory);
    setSubcategoryForm({
      category_id: subcategory.category_id,
      name: subcategory.name,
      description: subcategory.description ?? '',
      image: subcategory.image ?? '',
      hero_image: subcategory.hero_image ?? '',
      hero_image_focus: subcategory.hero_image_focus ?? '',
      sort_order: String(subcategory.sort_order ?? 0),
      is_addon: Boolean(subcategory.is_addon),
      booking_behavior: subcategory.booking_behavior ?? '',
      home_sizes: subcategory.home_sizes ?? [],
      office_pricing: subcategory.office_pricing
        ? toOfficePricingForm(subcategory.office_pricing)
        : null,
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
    if (!subcategoryForm.category_id) {
      setSubcategoryFormError('Pick a category first.');
      return;
    }
    setSavingSubcategory(true);
    setSubcategoryFormError(null);

    try {
      const res = await apiFetch(
        editingSubcategory
          ? `/api/catalog/subcategories/${editingSubcategory.id}`
          : '/api/catalog/subcategories',
        {
          method: editingSubcategory ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category_id: Number(subcategoryForm.category_id),
            name: subcategoryForm.name.trim(),
            description: subcategoryForm.description.trim() || null,
            image: subcategoryForm.image || null,
            hero_image: subcategoryForm.hero_image || null,
            hero_image_focus: subcategoryForm.hero_image_focus || null,
            sort_order: Number(subcategoryForm.sort_order) || 0,
            is_addon: subcategoryForm.is_addon,
            booking_behavior: subcategoryForm.booking_behavior || null,
            home_sizes: subcategoryForm.home_sizes,
            office_pricing: subcategoryForm.office_pricing
              ? fromOfficePricingForm(subcategoryForm.office_pricing)
              : null,
          }),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Failed to save subcategory.');

      setShowSubcategoryModal(false);
      setEditingSubcategory(null);
      await fetchSubcategories();
    } catch (err) {
      setSubcategoryFormError(err instanceof Error ? err.message : 'Failed to save subcategory.');
    } finally {
      setSavingSubcategory(false);
    }
  }

  async function handleDeleteSubcategory() {
    if (!deleteSubcategory) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/catalog/subcategories/${deleteSubcategory.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete subcategory.');
      const id = deleteSubcategory.id;
      setDeleteSubcategory(null);
      if (activeSubcategory?.id === id) goToCategory();
      await Promise.all([fetchSubcategories(), fetchServices()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete subcategory.');
    } finally {
      setDeleting(false);
    }
  }

  // --- Advanced form helpers -------------------------------------------------

  function toggleBookingMode(mode: BookingMode['mode']) {
    setForm((prev: any) => {
      const modes: BookingMode[] = prev.booking_modes || [];
      const has = modes.some((m) => m.mode === mode);
      return {
        ...prev,
        booking_modes: has
          ? modes.filter((m) => m.mode !== mode)
          : [
              ...modes,
              {
                mode,
                min_lead_time_hours: 0,
                blackout_dates: [],
                recurrence_frequency: null,
                recurrence_discount_pct: null,
              },
            ],
      };
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
    setForm((prev: any) => ({
      ...prev,
      variants: [...prev.variants, { attribute_key: '', attribute_value: '' }],
    }));
  }

  function removeVariant(index: number) {
    setForm((prev: any) => {
      const variants = [...prev.variants];
      variants.splice(index, 1);
      return { ...prev, variants };
    });
  }

  function setHomeSize(index: number, field: keyof HomeSize, value: string) {
    setSubcategoryForm((prev) => {
      const home_sizes = [...prev.home_sizes];
      home_sizes[index] = {
        ...home_sizes[index],
        [field]: field === 'hours' ? Number(value) || 0 : value,
      };
      return { ...prev, home_sizes };
    });
  }

  function addHomeSize() {
    setSubcategoryForm((prev) => ({
      ...prev,
      home_sizes: [...prev.home_sizes, { label: '', hours: 2, description: '' }],
    }));
  }

  function removeHomeSize(index: number) {
    setSubcategoryForm((prev) => {
      const home_sizes = [...prev.home_sizes];
      home_sizes.splice(index, 1);
      return { ...prev, home_sizes };
    });
  }

  function setOfficeSize(index: number, field: 'label' | 'threeWeek' | 'daily', value: string) {
    setSubcategoryForm((prev) => {
      if (!prev.office_pricing) return prev;
      const sizes = [...prev.office_pricing.sizes];
      sizes[index] = { ...sizes[index], [field]: value };
      return { ...prev, office_pricing: { ...prev.office_pricing, sizes } };
    });
  }

  function addOfficeSize() {
    setSubcategoryForm((prev) =>
      prev.office_pricing
        ? {
            ...prev,
            office_pricing: {
              ...prev.office_pricing,
              sizes: [...prev.office_pricing.sizes, { id: '', label: '', threeWeek: '', daily: '' }],
            },
          }
        : prev
    );
  }

  function removeOfficeSize(index: number) {
    setSubcategoryForm((prev) => {
      if (!prev.office_pricing) return prev;
      const sizes = [...prev.office_pricing.sizes];
      sizes.splice(index, 1);
      return { ...prev, office_pricing: { ...prev.office_pricing, sizes } };
    });
  }

  function setOfficeDedicated(index: number, field: keyof OfficeDedicated, value: string) {
    setSubcategoryForm((prev) => {
      if (!prev.office_pricing) return prev;
      const dedicated = [...prev.office_pricing.dedicated];
      dedicated[index] = { ...dedicated[index], [field]: value };
      return { ...prev, office_pricing: { ...prev.office_pricing, dedicated } };
    });
  }

  function addOfficeDedicated() {
    setSubcategoryForm((prev) =>
      prev.office_pricing
        ? {
            ...prev,
            office_pricing: {
              ...prev.office_pricing,
              dedicated: [...prev.office_pricing.dedicated, { id: '', title: '', subtitle: '', range: '' }],
            },
          }
        : prev
    );
  }

  function removeOfficeDedicated(index: number) {
    setSubcategoryForm((prev) => {
      if (!prev.office_pricing) return prev;
      const dedicated = [...prev.office_pricing.dedicated];
      dedicated.splice(index, 1);
      return { ...prev, office_pricing: { ...prev.office_pricing, dedicated } };
    });
  }

  // --- Render ----------------------------------------------------------------

  const viewTitle = query
    ? `Results for “${query}”`
    : activeSubcategory
      ? activeSubcategory.name
      : activeCategory
        ? activeCategory.name
        : 'Service catalog';
  const viewSubtitle = query
    ? `${searchResults.length} service${searchResults.length === 1 ? '' : 's'} found`
    : activeSubcategory
      ? activeSubcategory.description || `${activeCategory?.name} · ${subServices.length} service${subServices.length === 1 ? '' : 's'}`
      : activeCategory
        ? activeCategory.description || `${visibleSubcategories.length} subcategories`
        : 'Browse the catalog the way customers do — category, subcategory, then services.';

  function ServiceRow({ s, mode, path }: { s: CatalogService; mode?: PreviewMode; path?: string }) {
    const label = optionLabel(s, mode);
    const meta = [
      mode === 'duration_list' || mode === 'wellness_session' || mode === 'house_cleaning'
        ? null
        : s.duration,
      serviceMeta(s) || null,
    ]
      .filter(Boolean)
      .join(' · ');
    const price = sellPrice(s);
    const st = STATUS_CFG[s.status] ?? STATUS_CFG.pending_rates;
    const isHourOption = mode === 'house_cleaning' && hourOptionIds.has(s.id);
    // Under the house-cleaning picker only flagged (or name-matched) rows are
    // reachable at all — everything else in the subcategory is dead data as
    // far as the storefront is concerned, so flag it here rather than making
    // admins open each service to discover that.
    const isHidden = mode === 'house_cleaning' && !isHourOption;
    return (
      <div className={clsx('flex items-center gap-3 px-4 py-3 border-b border-lightstone/60 last:border-0', isHidden && 'opacity-60')}>
        {s.image ? (
          <div className="w-9 h-9 rounded-lg overflow-hidden border border-lightstone shrink-0">
            <img src={serviceImageUrl(s.image) ?? ''} alt={s.name} className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="w-9 h-9 rounded-lg bg-terracotta/10 flex items-center justify-center text-terracotta text-xs font-extrabold shrink-0">
            {s.name.substring(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-charcoal truncate">{label}</p>
          <p className="text-[11px] text-warmgrey truncate">
            {label !== s.name ? `${s.name} · ` : ''}
            {meta || 'No duration or rate set'}
          </p>
          {path && <p className="text-[10px] text-warmgrey/80 truncate">{path}</p>}
        </div>
        {isHourOption && (
          <span className="hidden sm:inline-flex shrink-0 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-terracotta/10 text-terracotta">
            Hours option
          </span>
        )}
        {isHidden && (
          <span
            title="This service isn't flagged as an Hours option (or named &quot;One-Time Cleaning …&quot;), so it never appears on the storefront while this subcategory uses the house-cleaning picker."
            className="hidden sm:inline-flex shrink-0 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-dustyrose/10 text-rosewood"
          >
            Not shown to customers
          </span>
        )}
        <span className="shrink-0 text-sm font-bold text-charcoal">
          {price === null ? 'Custom quote' : `S$${price.toFixed(2)}`}
        </span>
        <span
          className={clsx(
            'hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[11px] font-semibold shrink-0',
            st.cls
          )}
        >
          <span className={clsx('w-1.5 h-1.5 rounded-full', st.dot)} />
          {st.label}
        </span>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => openEditService(s)}
            className="p-1.5 rounded-lg text-warmgrey hover:text-terracotta hover:bg-accent-50 transition"
            title="Edit"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => setDeleteServiceId(s.id)}
            className="p-1.5 rounded-lg text-warmgrey hover:text-rosewood hover:bg-dustyrose/10 transition"
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    );
  }

  const rule = formRule ?? { strategy: 'flat', params: {} };
  const houseHours = (parseDurationMinutes(form.duration) || 0) / 60 || '';

  return (
    <div className="space-y-5 pb-6">
      {/* Header: back breadcrumb + title + level actions */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {!query && activeCategory && (
            <button
              type="button"
              onClick={activeSubcategory ? goToCategory : goToCatalog}
              className="inline-flex items-center gap-1 text-sm font-semibold text-terracotta hover:text-charcoal transition mb-1"
            >
              <ChevronLeft size={15} />
              {activeSubcategory ? activeCategory.name : 'All categories'}
            </button>
          )}
          <h1 className="text-lg font-bold text-charcoal truncate">{viewTitle}</h1>
          <p className="text-xs text-warmgrey mt-0.5">{viewSubtitle}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!query && !activeCategory && (
            <button
              onClick={openCreateCategory}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-charcoal bg-white border border-lightstone hover:border-terracotta/50 px-3.5 py-2 rounded-xl transition"
            >
              <Tag size={14} /> Add category
            </button>
          )}
          {!query && activeCategory && !activeSubcategory && (
            <>
              <button
                onClick={() => openEditCategory(activeCategory)}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-charcoal bg-white border border-lightstone hover:border-terracotta/50 px-3.5 py-2 rounded-xl transition"
              >
                <Pencil size={14} /> Edit category
              </button>
              <button
                onClick={() => openCreateSubcategory(activeCategory.id)}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-charcoal bg-white border border-lightstone hover:border-terracotta/50 px-3.5 py-2 rounded-xl transition"
              >
                <Plus size={14} /> Add subcategory
              </button>
            </>
          )}
          {!query && activeSubcategory && (
            <>
              <button
                onClick={() => openEditSubcategory(activeSubcategory)}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-charcoal bg-white border border-lightstone hover:border-terracotta/50 px-3.5 py-2 rounded-xl transition"
              >
                <Pencil size={14} /> Edit subcategory
              </button>
              <button
                onClick={() => setDeleteSubcategory(activeSubcategory)}
                className="p-2 rounded-xl text-warmgrey bg-white border border-lightstone hover:text-rosewood hover:border-dustyrose/50 transition"
                title="Delete subcategory"
              >
                <Trash2 size={14} />
              </button>
            </>
          )}
          <button
            onClick={openCreateService}
            className="inline-flex items-center gap-1.5 text-sm font-semibold bg-terracotta hover:bg-accent-700 text-white px-3.5 py-2 rounded-xl transition shadow-sm shadow-soft"
          >
            <Plus size={14} /> Add service
          </button>
        </div>
      </div>

      {error && (
        <p className="px-5 py-3 text-sm text-rosewood bg-dustyrose/10 rounded-xl border border-dustyrose/20">
          {error}
        </p>
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
      ) : query ? (
        /* ---- Search results: flat service list across the whole catalog ---- */
        searchResults.length === 0 ? (
          <div className="bg-white rounded-2xl border border-lightstone text-center py-16">
            <Package size={32} className="text-lightstone mx-auto mb-3" />
            <p className="text-sm text-warmgrey">No catalog services match your search.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-lightstone shadow-sm">
            {searchResults.map((s) => (
              <ServiceRow
                key={s.id}
                s={s}
                path={`${s.category}${s.subcategory ? ` › ${s.subcategory}` : ' › Unassigned'}`}
              />
            ))}
          </div>
        )
      ) : activeSubcategory ? (
        /* ---- Level 3: services inside one subcategory ---- */
        <div className="space-y-4">
          {activeSubcategory.is_addon && (
            <div className="rounded-xl border border-terracotta/30 bg-accent-50/60 p-3.5 text-[11px] text-warmgrey leading-relaxed">
              <strong className="text-charcoal">Add-on group.</strong> These services don’t appear in
              the storefront grid — they’re offered in the Add-ons panel of other bookings in{' '}
              {activeCategory?.name}. Manage them from the{' '}
              <Link to="/addons" className="text-terracotta font-semibold hover:underline">
                Add-ons tab
              </Link>
              .
            </div>
          )}
          {subPreview && (
            <div
              className={clsx(
                'rounded-xl border p-3.5 flex items-start gap-2.5',
                subPreview.warning ? 'border-amber-300 bg-amber-50' : 'border-terracotta/30 bg-accent-50/60'
              )}
            >
              {subPreview.warning ? (
                <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
              ) : (
                <Eye size={16} className="text-terracotta mt-0.5 shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-xs font-bold text-charcoal">
                  Customers see this as: {subPreview.label}
                </p>
                <p className="text-[11px] text-warmgrey mt-0.5 leading-relaxed">{subPreview.detail}</p>
                {subPreview.warning && (
                  <p className="text-[11px] font-semibold text-amber-700 mt-1">{subPreview.warning}</p>
                )}
                {subPreview.mode === 'house_cleaning' && subServices.length - hourOptionIds.size > 0 && (
                  <p className="text-[11px] font-semibold text-rosewood mt-1">
                    {subServices.length - hourOptionIds.size} of {subServices.length} services here are
                    not an "Hours option" — they're never shown to customers while this subcategory uses
                    the house-cleaning picker (marked "Not shown to customers" below).
                  </p>
                )}
              </div>
            </div>
          )}
          {orderedSubServices.length === 0 ? (
            <div className="bg-white rounded-2xl border border-lightstone text-center py-14">
              <Package size={32} className="text-lightstone mx-auto mb-3" />
              <p className="text-sm text-warmgrey mb-4">No services in this subcategory yet.</p>
              <button
                onClick={openCreateService}
                className="inline-flex items-center gap-1.5 text-sm font-semibold bg-terracotta hover:bg-accent-700 text-white px-3.5 py-2 rounded-xl transition"
              >
                <Plus size={14} /> Add the first service
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-lightstone shadow-sm">
              {orderedSubServices.map((s) => (
                <ServiceRow key={s.id} s={s} mode={subPreview?.mode} />
              ))}
            </div>
          )}
        </div>
      ) : activeCategory ? (
        /* ---- Level 2: subcategories inside one category ---- */
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {visibleSubcategories.map((sub) => (
              <Tile
                key={sub.id}
                image={sub.image}
                name={sub.name}
                subtitle={`${sub.service_count} service${sub.service_count === 1 ? '' : 's'}`}
                chips={
                  <>
                    {sub.is_addon && (
                      <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-700">
                        Add-on
                      </span>
                    )}
                    {sub.booking_behavior && (
                      <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-accent-50 text-terracotta">
                        {BEHAVIOR_SHORT_LABELS[sub.booking_behavior] ?? sub.booking_behavior}
                      </span>
                    )}
                  </>
                }
                onClick={() => openSubcategory(sub.id)}
                action={
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditSubcategory(sub);
                    }}
                    className="p-1.5 rounded-lg bg-white/90 border border-lightstone text-warmgrey hover:text-terracotta transition"
                    title="Edit subcategory"
                  >
                    <Pencil size={12} />
                  </button>
                }
              />
            ))}
            <AddTile label="Add subcategory" onClick={() => openCreateSubcategory(activeCategory.id)} />
          </div>

          {unassignedServices.length > 0 && (
            <div className="bg-white rounded-2xl border border-amber-300 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-amber-200 bg-amber-50/60 flex items-start gap-2.5">
                <AlertTriangle size={15} className="text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-charcoal">
                    Unassigned — hidden from the storefront
                  </p>
                  <p className="text-[11px] text-warmgrey mt-0.5">
                    These services are in {activeCategory.name} but no subcategory, so customers can’t
                    reach them. Edit one to assign it.
                  </p>
                </div>
              </div>
              <div>
                {unassignedServices.map((s) => (
                  <ServiceRow key={s.id} s={s} />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ---- Level 1: category grid, like the storefront home ---- */
        categories.length === 0 ? (
          <div className="bg-white rounded-2xl border border-lightstone text-center py-16">
            <Package size={32} className="text-lightstone mx-auto mb-3" />
            <p className="text-sm text-warmgrey mb-4">No categories yet.</p>
            <button
              onClick={openCreateCategory}
              className="inline-flex items-center gap-1.5 text-sm font-semibold bg-terracotta hover:bg-accent-700 text-white px-3.5 py-2 rounded-xl transition"
            >
              <Plus size={14} /> Add the first category
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {categories.map((c) => {
              const subCount = subsForCategory(c.id).filter((s) => !s.is_addon).length;
              const svcCount = services.filter((s) => s.category_id === c.id).length;
              return (
                <Tile
                  key={c.id}
                  image={c.image}
                  name={c.name}
                  subtitle={`${subCount} option${subCount === 1 ? '' : 's'} · ${svcCount} service${svcCount === 1 ? '' : 's'}`}
                  onClick={() => openCategory(c.id)}
                  action={
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditCategory(c);
                      }}
                      className="p-1.5 rounded-lg bg-white/90 border border-lightstone text-warmgrey hover:text-terracotta transition"
                      title="Edit category"
                    >
                      <Pencil size={12} />
                    </button>
                  }
                />
              );
            })}
            <AddTile label="Add category" onClick={openCreateCategory} />
          </div>
        )
      )}

      {/* ---- Service modal ---- */}
      {showModal && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/20 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl border border-lightstone overflow-hidden max-h-[92vh] flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-lightstone shrink-0">
                <div>
                  <h2 className="text-base font-bold text-charcoal">
                    {editingService ? 'Edit Service' : 'Add Service'}
                  </h2>
                  <p className="text-xs text-warmgrey mt-0.5">
                    {selectedFormSubcategory
                      ? `${selectedFormCategory?.name ?? ''} › ${selectedFormSubcategory.name}`
                      : 'What the customer picks on the storefront'}
                  </p>
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
                  <div>
                    <label className="block text-xs font-semibold text-warmgrey mb-1.5">Category *</label>
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
                    <label className="block text-xs font-semibold text-warmgrey mb-1.5">Subcategory</label>
                    <select
                      value={form.subcategory_id || ''}
                      onChange={(e) => setForm((p: any) => ({ ...p, subcategory_id: e.target.value }))}
                      className={inputCls}
                    >
                      <option value="">Unassigned (hidden from storefront)</option>
                      {subcategoriesForFormCategory.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-warmgrey mb-1.5">
                      {formMode === 'room_type' ? 'Unit type name *' : 'Name *'}
                    </label>
                    <input
                      type="text"
                      value={form.name || ''}
                      onChange={(e) => setForm((p: any) => ({ ...p, name: e.target.value }))}
                      className={inputCls}
                      placeholder={
                        formMode === 'room_type'
                          ? 'e.g. Move-Out 2BR (600-799 sqft)'
                          : 'e.g. Home Cleaning'
                      }
                    />
                  </div>
                </div>

                {/* Storefront preview — computed with the same name/duration
                    rules ServiceDetail.jsx uses, so what you see here is what
                    the customer gets. */}
                {form.subcategory_id ? (
                  behaviorPreview && (
                    <div className="space-y-2">
                      {!behaviorPreview.currentServiceVisible && (
                        <div className="rounded-xl border border-rosewood/40 bg-dustyrose/10 p-3.5 flex items-start gap-2.5">
                          <AlertTriangle size={16} className="text-rosewood mt-0.5 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-rosewood">
                              This service will NOT appear on the storefront
                            </p>
                            <p className="text-[11px] text-rosewood/90 mt-0.5 leading-relaxed">
                              {behaviorPreview.currentServiceNote}
                            </p>
                          </div>
                        </div>
                      )}
                      {behaviorPreview.currentServiceVisible && behaviorPreview.currentServiceNote && (
                        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 flex items-start gap-2.5">
                          <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
                          <p className="text-[11px] text-amber-800 leading-relaxed">
                            {behaviorPreview.currentServiceNote}
                          </p>
                        </div>
                      )}
                      <div
                        className={clsx(
                          'rounded-xl border p-3.5 flex items-start gap-2.5',
                          behaviorPreview.warning
                            ? 'border-amber-300 bg-amber-50'
                            : 'border-terracotta/30 bg-accent-50/60'
                        )}
                      >
                        {behaviorPreview.warning ? (
                          <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
                        ) : (
                          <Eye size={16} className="text-terracotta mt-0.5 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-charcoal">
                            Customers pick from: {behaviorPreview.label}
                          </p>
                          <p className="text-[11px] text-warmgrey mt-0.5 leading-relaxed">
                            {behaviorPreview.detail}
                          </p>
                          {behaviorPreview.warning && (
                            <p className="text-[11px] font-semibold text-amber-700 mt-1">
                              {behaviorPreview.warning}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                ) : (
                  <p className="text-[11px] text-warmgrey italic">
                    Assign a subcategory above to preview how this service renders on the storefront.
                  </p>
                )}

                {/* In a house-cleaning subcategory, flagged services are the
                    "Hours per visit" options; with none flagged anywhere the
                    storefront falls back to the "One-Time Cleaning" name rule. */}
                {formCategoryIsCleaning &&
                  (selectedFormSubcategory?.booking_behavior === 'house_cleaning' ||
                    formMode === 'house_cleaning') && (
                    <label className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={Boolean(form.is_picker_option)}
                        onChange={(e) =>
                          setForm((p: any) => ({ ...p, is_picker_option: e.target.checked }))
                        }
                        className="mt-0.5 accent-terracotta"
                      />
                      <span>
                        <span className="block text-xs font-semibold text-charcoal">Hours option</span>
                        <span className="block text-xs text-warmgrey">
                          Show this service in the "Hours per visit" picker. Once any service in the
                          subcategory is flagged, only flagged services appear — the "One-Time
                          Cleaning" name rule is skipped.
                        </span>
                      </span>
                    </label>
                  )}

                {/* Pricing — the same three prices the storefront knows:
                    flat amount, partner cost x markup, or "Custom quote". */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-warmgrey uppercase tracking-wide">
                    Price the customer sees
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { mode: 'fixed' as PriceMode, label: 'Fixed price', hint: 'Customer pays S$ amount' },
                        { mode: 'markup' as PriceMode, label: 'Cost + markup', hint: 'Partner cost × (1 + markup)' },
                        { mode: 'quote' as PriceMode, label: 'Custom quote', hint: 'Quoted offline' },
                      ] as const
                    ).map((o) => (
                      <button
                        key={o.mode}
                        type="button"
                        onClick={() => setPriceMode(o.mode)}
                        className={clsx(
                          'rounded-xl border px-3 py-2.5 text-left transition',
                          priceMode === o.mode
                            ? 'bg-accent-100 border-terracotta text-terracotta'
                            : 'bg-white border-lightstone text-charcoal hover:border-terracotta/50'
                        )}
                      >
                        <span className="block text-xs font-bold">{o.label}</span>
                        <span className="block text-[10px] mt-0.5 opacity-80">{o.hint}</span>
                      </button>
                    ))}
                  </div>

                  {priceMode === 'fixed' && (
                    <div className="max-w-xs">
                      <label className="block text-xs font-semibold text-warmgrey mb-1.5">
                        Customer price (S$)
                      </label>
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
                  {priceMode === 'markup' && (
                    <p className="text-[11px] text-warmgrey leading-relaxed">
                      The storefront shows <strong>partner cost × (1 + markup)</strong> below, e.g.
                      S$46 cost × 1.30 = S$60. Set the partner cost — without it this service can’t
                      be booked online.
                    </p>
                  )}
                  {priceMode === 'quote' && (
                    <p className="text-[11px] text-warmgrey leading-relaxed">
                      The storefront shows <strong>“Custom quote”</strong> and checkout rejects online
                      bookings for it — ops confirms the price directly.
                    </p>
                  )}

                  {/* Advanced rule editor only surfaces for services already
                      saved with hourly/per-unit/tiered pricing, so nothing
                      existing is silently rewritten. */}
                  {priceMode === 'advanced' ? (
                    <div className="rounded-xl border border-lightstone p-3.5 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-bold text-charcoal">
                          Advanced pricing rule ({rule.strategy.replace('_', ' ')})
                        </p>
                        <button
                          type="button"
                          onClick={() => setPriceMode('fixed')}
                          className="text-[11px] font-semibold text-terracotta hover:text-accent-700"
                        >
                          Switch to fixed price
                        </button>
                      </div>
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
                                    const schedule = (rule.params.rate_schedule || []).filter(
                                      (_: any, i: number) => i !== index
                                    );
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
                              const schedule = [
                                ...(rule.params.rate_schedule || []),
                                { start: '', end: '', rate: '' },
                              ];
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
                                    const tiers = (rule.params.tiers || []).filter(
                                      (_: any, i: number) => i !== index
                                    );
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
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPriceMode('advanced')}
                      className="text-[11px] font-semibold text-warmgrey hover:text-terracotta"
                    >
                      Advanced pricing rule (hourly, per-unit, tiered)…
                    </button>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-warmgrey mb-1.5">
                        Partner cost (S$)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.default_partner_cost ?? ''}
                        onChange={(e) =>
                          setForm((p: any) => ({ ...p, default_partner_cost: e.target.value }))
                        }
                        className={inputCls}
                        placeholder="e.g. 46"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-warmgrey mb-1.5">
                        Markup % <span className="font-normal">(blank = 30%)</span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.markup_pct_override ?? ''}
                        onChange={(e) =>
                          setForm((p: any) => ({ ...p, markup_pct_override: e.target.value }))
                        }
                        className={inputCls}
                        placeholder="30"
                      />
                    </div>
                  </div>
                </div>

                {/* Visit details — duration is labelled the way the picker
                    uses it, and workers/rate show as the option subline. */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-warmgrey mb-1.5">
                      {formMode === 'house_cleaning'
                        ? 'Hours per visit'
                        : formMode === 'wellness_session'
                          ? 'Session length'
                          : 'Duration'}
                    </label>
                    {formMode === 'house_cleaning' ? (
                      <input
                        type="number"
                        step="0.5"
                        min="0.5"
                        value={houseHours}
                        onChange={(e) =>
                          setForm((p: any) => ({
                            ...p,
                            duration: e.target.value ? `${e.target.value} hrs` : '',
                          }))
                        }
                        className={inputCls}
                        placeholder="e.g. 3"
                      />
                    ) : (
                      <input
                        type="text"
                        value={form.duration || ''}
                        onChange={(e) => setForm((p: any) => ({ ...p, duration: e.target.value }))}
                        className={inputCls}
                        placeholder={
                          formMode === 'wellness_session' ? 'e.g. 45 min' : 'e.g. 2 hrs'
                        }
                      />
                    )}
                    {(formMode === 'duration_list' || formMode === 'wellness_session') && (
                      <p className="text-[10px] text-warmgrey mt-1">
                        Must be parseable — it becomes the option label.
                      </p>
                    )}
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
                        <option key={r.value} value={r.value}>
                          {r.label}
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
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-warmgrey mb-1.5">Image</label>
                    <ImageUploadField
                      value={form.image || ''}
                      name={form.name || ''}
                      onChange={(path) => setForm((p: any) => ({ ...p, image: path }))}
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-xs font-semibold text-warmgrey mb-1.5">Description</label>
                    <textarea
                      rows={2}
                      value={form.description || ''}
                      onChange={(e) => setForm((p: any) => ({ ...p, description: e.target.value }))}
                      className={clsx(inputCls, 'resize-none')}
                      placeholder="Short description…"
                    />
                  </div>
                </div>

                {/* Rarely needed: booking modes and variant attributes are not
                    read by the storefront today, but are kept so existing data
                    round-trips on save. */}
                <details className="rounded-xl border border-lightstone px-4 py-3">
                  <summary className="text-xs font-semibold text-warmgrey cursor-pointer select-none">
                    Advanced — booking modes &amp; variant attributes (not shown on the storefront)
                  </summary>
                  <div className="pt-3 space-y-4">
                    <div>
                      <p className="text-xs font-semibold text-warmgrey mb-2">Booking modes</p>
                      <div className="flex gap-4">
                        {(['on_demand', 'scheduled', 'recurring'] as BookingMode['mode'][]).map(
                          (mode) => (
                            <label
                              key={mode}
                              className="flex items-center gap-1.5 text-sm text-charcoal cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={(form.booking_modes || []).some(
                                  (m: BookingMode) => m.mode === mode
                                )}
                                onChange={() => toggleBookingMode(mode)}
                                className="rounded border-lightstone text-terracotta focus:ring-terracotta/30"
                              />
                              {mode.replace('_', '-')}
                            </label>
                          )
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-warmgrey mb-2">Variant attributes</p>
                      <div className="space-y-2">
                        {Array.isArray(selectedFormCategory?.variant_schema) &&
                        selectedFormCategory.variant_schema.length ? (
                          selectedFormCategory.variant_schema.map((attr: any, index: number) => {
                            const value = (form.variants || [])[index]?.attribute_value || '';
                            if (attr.type === 'select') {
                              const options = String(attr.options || '')
                                .split(',')
                                .map((s: string) => s.trim())
                                .filter(Boolean);
                              return (
                                <div key={index} className="space-y-1">
                                  <label className="block text-[10px] text-warmgrey">
                                    {attr.label || attr.key}
                                  </label>
                                  <select
                                    value={value}
                                    onChange={(e) => setVariant(index, 'attribute_value', e.target.value)}
                                    className={inputCls}
                                  >
                                    <option value="">Select…</option>
                                    {options.map((opt: string) => (
                                      <option key={opt} value={opt}>
                                        {opt}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              );
                            }
                            const inputType = attr.type === 'number' ? 'number' : 'text';
                            return (
                              <div key={index} className="space-y-1">
                                <label className="block text-[10px] text-warmgrey">
                                  {attr.label || attr.key}
                                </label>
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
                  </div>
                </details>

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

      {/* ---- Delete service ---- */}
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
                  onClick={handleDeleteService}
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

      {/* ---- Delete subcategory ---- */}
      {deleteSubcategory && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/20 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 border border-lightstone space-y-4">
              <div className="w-10 h-10 rounded-xl bg-dustyrose/10 flex items-center justify-center mb-1">
                <Trash2 size={18} className="text-rosewood" />
              </div>
              <div>
                <h3 className="text-base font-bold text-charcoal">
                  Delete “{deleteSubcategory.name}”?
                </h3>
                <p className="text-sm text-warmgrey mt-1">
                  Its {deleteSubcategory.service_count} service
                  {deleteSubcategory.service_count === 1 ? '' : 's'} will be kept but become
                  unassigned (hidden from the storefront until reassigned).
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setDeleteSubcategory(null)}
                  className="px-4 py-2 text-sm font-semibold text-warmgrey bg-accent-50 hover:bg-lightstone rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteSubcategory}
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

      {/* ---- Category modal ---- */}
      {showCategoryModal && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/20 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm border border-lightstone overflow-hidden max-h-[92vh] flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-lightstone shrink-0">
                <div>
                  <h2 className="text-base font-bold text-charcoal">
                    {editingCategory ? 'Edit Category' : 'Add Category'}
                  </h2>
                  <p className="text-xs text-warmgrey mt-0.5">
                    A top-level tile on the storefront, e.g. “Cleaning”
                  </p>
                </div>
                <button
                  onClick={() => { setShowCategoryModal(false); setEditingCategory(null); }}
                  className="p-1.5 hover:bg-accent-50 rounded-lg transition"
                >
                  <X size={16} className="text-warmgrey" />
                </button>
              </div>
              <form onSubmit={handleSaveCategory} className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
                <div>
                  <label className="block text-xs font-semibold text-warmgrey mb-1.5">Name *</label>
                  <input
                    type="text"
                    value={categoryForm.name}
                    onChange={(e) => setCategoryForm((p) => ({ ...p, name: e.target.value }))}
                    className={inputCls}
                    placeholder="e.g. Cleaning"
                  />
                  <p className="text-[11px] text-warmgrey mt-1">
                    The name decides the storefront picker: “Cleaning” gets the home-cleaning pickers,
                    “Office Cleaning” the office picker, “Wellness” the session picker.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-warmgrey mb-1.5">Description</label>
                  <textarea
                    rows={2}
                    value={categoryForm.description}
                    onChange={(e) => setCategoryForm((p) => ({ ...p, description: e.target.value }))}
                    className={clsx(inputCls, 'resize-none')}
                    placeholder="Shown under the category title on the storefront…"
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
                  <label className="block text-xs font-semibold text-warmgrey mb-1.5">Sort order</label>
                  <input
                    type="number"
                    value={categoryForm.sort_order}
                    onChange={(e) => setCategoryForm((p) => ({ ...p, sort_order: e.target.value }))}
                    className={inputCls}
                  />
                </div>

                <details className="rounded-xl border border-lightstone px-4 py-3">
                  <summary className="text-xs font-semibold text-warmgrey cursor-pointer select-none">
                    Advanced — variant schema (not shown on the storefront)
                  </summary>
                  <div className="pt-3 space-y-2">
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
                              const schema = categoryForm.variant_schema.filter(
                                (_: any, i: number) => i !== index
                              );
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
                          variant_schema: [
                            ...p.variant_schema,
                            { key: '', label: '', type: 'text', options: '' },
                          ],
                        }))
                      }
                      className="text-xs font-semibold text-terracotta hover:text-accent-700"
                    >
                      + Add attribute
                    </button>
                  </div>
                </details>

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

      {/* ---- Subcategory modal ---- */}
      {showSubcategoryModal && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/20 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg border border-lightstone overflow-hidden max-h-[92vh] flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-lightstone shrink-0">
                <div>
                  <h2 className="text-base font-bold text-charcoal">
                    {editingSubcategory ? 'Edit Subcategory' : 'Add Subcategory'}
                  </h2>
                  <p className="text-xs text-warmgrey mt-0.5">
                    A group of service options inside a category, e.g. “Weekly Package”
                  </p>
                </div>
                <button
                  onClick={() => { setShowSubcategoryModal(false); setEditingSubcategory(null); }}
                  className="p-1.5 hover:bg-accent-50 rounded-lg transition"
                >
                  <X size={16} className="text-warmgrey" />
                </button>
              </div>
              <form onSubmit={handleSaveSubcategory} className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
                <div>
                  <label className="block text-xs font-semibold text-warmgrey mb-1.5">Category *</label>
                  <select
                    value={subcategoryForm.category_id}
                    onChange={(e) =>
                      setSubcategoryForm((p) => ({
                        ...p,
                        category_id: e.target.value ? Number(e.target.value) : '',
                      }))
                    }
                    className={inputCls}
                  >
                    <option value="" disabled>
                      Pick a category
                    </option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
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
                  <label className="block text-xs font-semibold text-warmgrey mb-1.5">
                    Hero image <span className="font-normal">(service page banner — shared by every service in this subcategory)</span>
                  </label>
                  <ImageUploadField
                    value={subcategoryForm.hero_image}
                    name={subcategoryForm.name}
                    onChange={(path) => setSubcategoryForm((p) => ({ ...p, hero_image: path, hero_image_focus: '' }))}
                  />
                  <ImageFocusPicker
                    image={subcategoryForm.hero_image}
                    value={subcategoryForm.hero_image_focus}
                    onChange={(focus) => setSubcategoryForm((p) => ({ ...p, hero_image_focus: focus }))}
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
                      Services here are hidden from the storefront grid and offered in the Add-ons
                      panel of other bookings in this category.
                    </span>
                  </span>
                </label>

                <div>
                  <label className="block text-xs font-semibold text-warmgrey mb-1.5">
                    Storefront booking style
                  </label>
                  <select
                    value={subcategoryForm.booking_behavior}
                    onChange={(e) =>
                      setSubcategoryForm((p) => ({ ...p, booking_behavior: e.target.value }))
                    }
                    className={inputCls}
                  >
                    {BOOKING_BEHAVIOR_OPTIONS.filter(
                      (o) =>
                        formSubcategoryIsCleaning ||
                        o.value === subcategoryForm.booking_behavior || // keep a stale saved value visible
                        (o.value !== 'house_cleaning' && o.value !== 'office_cleaning')
                    ).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-warmgrey mt-1">
                    Which picker customers use for these services. Auto infers it from service names
                    (e.g. “One-Time Cleaning X hr” rows); pick a style to force it.
                    {formSubcategoryIsCleaning &&
                      ' For the house-cleaning picker, tick “Hours option” on each service that should be an “Hours per visit” choice.'}
                  </p>
                </div>

                {((formSubcategoryIsCleaning &&
                  (!subcategoryForm.booking_behavior ||
                    subcategoryForm.booking_behavior === 'house_cleaning')) ||
                  subcategoryForm.home_sizes.length > 0) && (
                  <div className="border-t border-lightstone pt-4">
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-warmgrey">
                        Home sizes (house-cleaning picker)
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setSubcategoryForm((p) => ({ ...p, home_sizes: DEFAULT_HOME_SIZES }))
                        }
                        className="text-[11px] font-semibold text-terracotta hover:text-accent-700"
                      >
                        Use default sizes
                      </button>
                    </div>
                    <p className="text-[11px] text-warmgrey mb-2">
                      Only used by the storefront’s size/hours/cleaners picker. Leave empty to use the
                      built-in Studio/1BR/2BR/3BR/4BR+ sizes.
                    </p>
                    {subcategoryForm.home_sizes.length > 0 && (
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="w-28 text-[10px] font-semibold uppercase tracking-wide text-warmgrey">
                          Size label
                        </span>
                        <span className="w-24 text-[10px] font-semibold uppercase tracking-wide text-warmgrey">
                          Suggested hrs
                        </span>
                        <span className="flex-1 text-[10px] font-semibold uppercase tracking-wide text-warmgrey">
                          Helper text
                        </span>
                        <span className="w-[30px]" />
                      </div>
                    )}
                    <div className="space-y-2">
                      {subcategoryForm.home_sizes.map((size, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <div className="w-28 shrink-0">
                            <input
                              type="text"
                              value={size.label}
                              onChange={(e) => setHomeSize(i, 'label', e.target.value)}
                              placeholder="3BR"
                              className={inputCls}
                            />
                          </div>
                          <div className="w-24 shrink-0">
                            <input
                              type="number"
                              step="0.5"
                              min="0"
                              value={size.hours}
                              onChange={(e) => setHomeSize(i, 'hours', e.target.value)}
                              placeholder="3"
                              className={inputCls}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <input
                              type="text"
                              value={size.description ?? ''}
                              onChange={(e) => setHomeSize(i, 'description', e.target.value)}
                              placeholder="A 3-bedroom (optional)"
                              className={inputCls}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => removeHomeSize(i)}
                            className="p-2 text-warmgrey hover:text-rosewood shrink-0"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={addHomeSize}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-terracotta hover:text-accent-700"
                    >
                      <Plus size={13} /> Add home size
                    </button>
                  </div>
                )}

                {(subcategoryForm.booking_behavior === 'office_cleaning' ||
                  subcategoryForm.office_pricing) && (
                  <div className="border-t border-lightstone pt-4">
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-warmgrey">
                        Office pricing (office-cleaning picker)
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setSubcategoryForm((p) => ({
                            ...p,
                            office_pricing: p.office_pricing
                              ? null
                              : toOfficePricingForm(DEFAULT_OFFICE_PRICING),
                          }))
                        }
                        className="text-[11px] font-semibold text-terracotta hover:text-accent-700"
                      >
                        {subcategoryForm.office_pricing
                          ? 'Clear — use built-in tables'
                          : 'Set custom pricing'}
                      </button>
                    </div>
                    <p className="text-[11px] text-warmgrey mb-2">
                      Feeds the storefront&apos;s office size/plan picker and recurring contract
                      cards. Blank price = “By quote” (Contact us card). Leave unset to use the
                      built-in tables.
                    </p>

                    {subcategoryForm.office_pricing && (
                      <div className="space-y-4">
                        <div className="flex gap-3">
                          <div className="w-36 shrink-0">
                            <label className="block text-[10px] font-semibold uppercase tracking-wide text-warmgrey mb-1">
                              One-time $/hr
                            </label>
                            <input
                              type="number"
                              min="0"
                              value={subcategoryForm.office_pricing.hourlyRate}
                              onChange={(e) =>
                                setSubcategoryForm((p) => ({
                                  ...p,
                                  office_pricing: p.office_pricing
                                    ? { ...p.office_pricing, hourlyRate: e.target.value }
                                    : p.office_pricing,
                                }))
                              }
                              placeholder="28"
                              className={inputCls}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <label className="block text-[10px] font-semibold uppercase tracking-wide text-warmgrey mb-1">
                              Hours per visit options
                            </label>
                            <input
                              type="text"
                              value={subcategoryForm.office_pricing.hours}
                              onChange={(e) =>
                                setSubcategoryForm((p) => ({
                                  ...p,
                                  office_pricing: p.office_pricing
                                    ? { ...p.office_pricing, hours: e.target.value }
                                    : p.office_pricing,
                                }))
                              }
                              placeholder="2, 3, 4, 6, 8"
                              className={inputCls}
                            />
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="flex-1 text-[10px] font-semibold uppercase tracking-wide text-warmgrey">
                              Office / premises size
                            </span>
                            <span className="w-24 text-[10px] font-semibold uppercase tracking-wide text-warmgrey">
                              3x/week $/mo
                            </span>
                            <span className="w-24 text-[10px] font-semibold uppercase tracking-wide text-warmgrey">
                              Daily $/mo
                            </span>
                            <span className="w-[30px]" />
                          </div>
                          <div className="space-y-2">
                            {subcategoryForm.office_pricing.sizes.map((size, i) => (
                              <div key={i} className="flex items-center gap-1.5">
                                <div className="flex-1 min-w-0">
                                  <input
                                    type="text"
                                    value={size.label}
                                    onChange={(e) => setOfficeSize(i, 'label', e.target.value)}
                                    placeholder="1,000–2,000 sqft"
                                    className={inputCls}
                                  />
                                </div>
                                <div className="w-24 shrink-0">
                                  <input
                                    type="number"
                                    min="0"
                                    value={size.threeWeek}
                                    onChange={(e) => setOfficeSize(i, 'threeWeek', e.target.value)}
                                    placeholder="By quote"
                                    className={inputCls}
                                  />
                                </div>
                                <div className="w-24 shrink-0">
                                  <input
                                    type="number"
                                    min="0"
                                    value={size.daily}
                                    onChange={(e) => setOfficeSize(i, 'daily', e.target.value)}
                                    placeholder="By quote"
                                    className={inputCls}
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeOfficeSize(i)}
                                  className="p-2 text-warmgrey hover:text-rosewood shrink-0"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={addOfficeSize}
                            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-terracotta hover:text-accent-700"
                          >
                            <Plus size={13} /> Add size band
                          </button>
                        </div>

                        <div>
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="w-44 text-[10px] font-semibold uppercase tracking-wide text-warmgrey">
                              Dedicated cleaner
                            </span>
                            <span className="flex-1 text-[10px] font-semibold uppercase tracking-wide text-warmgrey">
                              Subtitle
                            </span>
                            <span className="w-36 text-[10px] font-semibold uppercase tracking-wide text-warmgrey">
                              Rate range
                            </span>
                            <span className="w-[30px]" />
                          </div>
                          <div className="space-y-2">
                            {subcategoryForm.office_pricing.dedicated.map((d, i) => (
                              <div key={i} className="flex items-center gap-1.5">
                                <div className="w-44 shrink-0">
                                  <input
                                    type="text"
                                    value={d.title}
                                    onChange={(e) => setOfficeDedicated(i, 'title', e.target.value)}
                                    placeholder="Dedicated cleaner, Mon–Fri"
                                    className={inputCls}
                                  />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <input
                                    type="text"
                                    value={d.subtitle}
                                    onChange={(e) => setOfficeDedicated(i, 'subtitle', e.target.value)}
                                    placeholder="Full-time, stationed onsite"
                                    className={inputCls}
                                  />
                                </div>
                                <div className="w-36 shrink-0">
                                  <input
                                    type="text"
                                    value={d.range}
                                    onChange={(e) => setOfficeDedicated(i, 'range', e.target.value)}
                                    placeholder="S$2,900–S$4,200/mo"
                                    className={inputCls}
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeOfficeDedicated(i)}
                                  className="p-2 text-warmgrey hover:text-rosewood shrink-0"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={addOfficeDedicated}
                            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-terracotta hover:text-accent-700"
                          >
                            <Plus size={13} /> Add dedicated row
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

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
