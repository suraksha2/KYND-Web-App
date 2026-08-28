import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search, Pencil, Trash2, X, HeartHandshake, Package, ExternalLink } from "lucide-react";
import clsx from "clsx";
import ModalPortal from "@/components/ModalPortal";
import { apiFetch, serviceImageUrl } from "@/lib/api";

type HelpMoment = {
  id: string;
  slug: string;
  category: string | null;
  label: string;
  title: string;
  image: string | null;
  sortOrder: number;
  tags: string[];
};

type CatalogService = {
  id: string;
  name: string;
  category: string;
};

const defaultForm = {
  slug: "",
  category: "",
  label: "",
  title: "",
  image: "",
  sortOrder: "0",
  serviceIds: [] as string[],
};

function imageLabel(src: string) {
  return src
    .replace("/images/", "")
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c: string) => c.toUpperCase());
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export default function ServiceSubcategoriesPage() {
  const [search, setSearch] = useState("");
  const [moments, setMoments] = useState<HelpMoment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [catalogServices, setCatalogServices] = useState<CatalogService[]>([]);
  const [availableImages, setAvailableImages] = useState<string[]>([]);

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<HelpMoment | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchMoments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/service-subcategories");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load help moments.");
      setMoments(
        (json.data ?? []).map((m: any) => ({
          id: String(m.id),
          slug: m.slug,
          category: m.category,
          label: m.label,
          title: m.title,
          image: m.image || null,
          sortOrder: m.sortOrder ?? 0,
          tags: Array.isArray(m.tags) ? m.tags : [],
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load help moments.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMoments();
    apiFetch("/api/services")
      .then((res) => res.json())
      .then((json) => {
        setCatalogServices(
          (json.data ?? []).map((s: any) => ({
            id: String(s.id),
            name: s.name,
            category: s.category || "General",
          }))
        );
      })
      .catch((err) => console.error("Failed to fetch services", err));

    apiFetch("/api/images")
      .then((res) => res.json())
      .then((json) => setAvailableImages(json.data ?? []))
      .catch((err) => console.error("Failed to fetch images", err));
  }, [fetchMoments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return moments;
    return moments.filter(
      (m) =>
        m.slug.toLowerCase().includes(q) ||
        m.label.toLowerCase().includes(q) ||
        m.title.toLowerCase().includes(q) ||
        (m.category ?? "").toLowerCase().includes(q)
    );
  }, [moments, search]);

  function openCreate() {
    setEditing(null);
    setForm(defaultForm);
    setFormError(null);
    setShowModal(true);
  }

  async function openEdit(moment: HelpMoment) {
    setEditing(moment);
    setFormError(null);
    try {
      const res = await apiFetch(`/api/service-subcategories/${moment.id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load help moment.");
      const detail = json.data;
      setForm({
        slug: detail.slug ?? moment.slug,
        category: detail.category ?? "",
        label: detail.label ?? "",
        title: detail.title ?? "",
        image: detail.image ?? "",
        sortOrder: String(detail.sortOrder ?? 0),
        serviceIds: (detail.services ?? []).map((s: any) => String(s.id)),
      });
      setShowModal(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load help moment.");
    }
  }

  function toggleService(serviceId: string) {
    setForm((prev) => ({
      ...prev,
      serviceIds: prev.serviceIds.includes(serviceId)
        ? prev.serviceIds.filter((id) => id !== serviceId)
        : [...prev.serviceIds, serviceId],
    }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.label.trim() || !form.title.trim()) {
      setFormError("Label and title are required.");
      return;
    }

    setSaving(true);
    setFormError(null);

    const payload = {
      slug: form.slug.trim() || slugify(form.title),
      category: form.category.trim() || null,
      label: form.label.trim(),
      title: form.title.trim(),
      image: form.image || null,
      sortOrder: Number(form.sortOrder) || 0,
      serviceIds: form.serviceIds,
    };

    try {
      const url = editing
        ? `/api/service-subcategories/${editing.id}`
        : "/api/service-subcategories";
      const res = await apiFetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to save help moment.");

      setShowModal(false);
      setEditing(null);
      setForm(defaultForm);
      await fetchMoments();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save help moment.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/service-subcategories/${deleteId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? "Failed to delete help moment.");
      }
      setDeleteId(null);
      await fetchMoments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete help moment.");
    } finally {
      setDeleting(false);
    }
  }

  const inputCls =
    "w-full px-3 py-2 text-sm bg-gray-50 border border-lightstone rounded-xl focus:outline-none focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta transition placeholder:text-warmgrey";

  const storefrontBase = import.meta.env.BASE_URL.replace(/\/$/, "");

  return (
    <div className="space-y-6 pb-6">
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
        {[
          { label: "Help moments", value: moments.length, icon: HeartHandshake, color: "bg-terracotta" },
          { label: "Linked services", value: moments.reduce((n, m) => n + m.tags.length, 0), icon: Package, color: "bg-sage" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-lightstone shadow-sm p-5">
            <div className={clsx("w-10 h-10 rounded-xl flex items-center justify-center mb-3", color)}>
              <Icon size={18} className="text-white" />
            </div>
            <p className="text-xl font-bold text-charcoal">{value}</p>
            <p className="text-sm text-warmgrey mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-lightstone shadow-sm overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-lightstone">
          <div>
            <h2 className="text-sm font-bold text-charcoal">Help moments</h2>
            <p className="text-xs text-warmgrey mt-0.5">
              Storefront cards linking to <code className="text-xs">/help/&lt;slug&gt;</code>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-warmgrey" />
              <input
                type="search"
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-3 py-2 text-sm border border-lightstone rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-terracotta/30 w-44 sm:w-52"
              />
            </div>
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 text-sm font-semibold bg-terracotta hover:bg-accent-700 text-white px-3.5 py-2 rounded-xl transition shadow-sm shadow-soft"
            >
              <Plus size={14} /> Add moment
            </button>
          </div>
        </div>

        {error && (
          <p className="px-5 py-3 text-sm text-rosewood bg-dustyrose/10 border-b border-dustyrose/20">{error}</p>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
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
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <HeartHandshake size={28} className="text-lightstone mx-auto mb-2" />
            <p className="text-sm text-warmgrey">No help moments yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-warmgrey border-b border-lightstone bg-gray-50/80">
                  <th className="px-5 py-3 font-semibold">Moment</th>
                  <th className="px-5 py-3 font-semibold">Slug</th>
                  <th className="px-5 py-3 font-semibold">Category</th>
                  <th className="px-5 py-3 font-semibold">Services</th>
                  <th className="px-5 py-3 font-semibold">Order</th>
                  <th className="px-5 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.id} className="border-b border-lightstone/80 hover:bg-accent-50/40">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-warmlinen overflow-hidden shrink-0 grid place-items-center">
                          {m.image ? (
                            <img
                              src={serviceImageUrl(m.image) ?? ""}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <HeartHandshake size={18} className="text-terracotta" />
                          )}
                        </div>
                        <div>
                          <p className="font-semibold text-charcoal">{m.title}</p>
                          <p className="text-xs text-warmgrey">{m.label}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <code className="text-xs bg-warmlinen px-2 py-1 rounded-lg">{m.slug}</code>
                    </td>
                    <td className="px-5 py-4 text-warmgrey">{m.category || "—"}</td>
                    <td className="px-5 py-4">
                      {m.tags.length ? (
                        <div className="flex flex-wrap gap-1">
                          {m.tags.map((tag) => (
                            <span
                              key={tag}
                              className="text-xs bg-accent-50 text-charcoal px-2 py-0.5 rounded-full"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-warmgrey">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-warmgrey">{m.sortOrder}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <a
                          href={`${storefrontBase}/help/${m.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-2 rounded-lg text-warmgrey hover:text-terracotta hover:bg-accent-50 transition"
                          title="View on storefront"
                        >
                          <ExternalLink size={15} />
                        </a>
                        <button
                          onClick={() => openEdit(m)}
                          className="p-2 rounded-lg text-warmgrey hover:text-terracotta hover:bg-accent-50 transition"
                          title="Edit"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => setDeleteId(m.id)}
                          className="p-2 rounded-lg text-warmgrey hover:text-rosewood hover:bg-dustyrose/10 transition"
                          title="Delete"
                        >
                          <Trash2 size={15} />
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

      {showModal && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/20 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg border border-lightstone overflow-hidden max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-lightstone shrink-0">
                <div>
                  <h2 className="text-base font-bold text-charcoal">
                    {editing ? "Edit help moment" : "Add help moment"}
                  </h2>
                  <p className="text-xs text-warmgrey mt-0.5">Shown on the storefront home page</p>
                </div>
                <button
                  onClick={() => {
                    setShowModal(false);
                    setEditing(null);
                  }}
                  className="p-1.5 hover:bg-accent-50 rounded-lg transition"
                >
                  <X size={16} className="text-warmgrey" />
                </button>
              </div>

              <form onSubmit={handleSave} className="px-6 py-5 space-y-4 overflow-y-auto">
                <div>
                  <label className="block text-xs font-semibold text-warmgrey mb-1.5">Label *</label>
                  <input
                    type="text"
                    placeholder="e.g. New baby moment"
                    value={form.label}
                    onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-warmgrey mb-1.5">Title *</label>
                  <input
                    type="text"
                    placeholder="e.g. Getting ready for a new baby"
                    value={form.title}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        title: e.target.value,
                        slug: p.slug || slugify(e.target.value),
                      }))
                    }
                    className={inputCls}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-warmgrey mb-1.5">Slug</label>
                    <input
                      type="text"
                      placeholder="new-baby"
                      value={form.slug}
                      onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-warmgrey mb-1.5">Sort order</label>
                    <input
                      type="number"
                      value={form.sortOrder}
                      onChange={(e) => setForm((p) => ({ ...p, sortOrder: e.target.value }))}
                      className={inputCls}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-warmgrey mb-1.5">Parent category</label>
                  <input
                    type="text"
                    placeholder="e.g. Childcare"
                    value={form.category}
                    onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-warmgrey mb-1.5">Hero image</label>
                  <select
                    value={form.image}
                    onChange={(e) => setForm((p) => ({ ...p, image: e.target.value }))}
                    className={inputCls}
                  >
                    <option value="">None</option>
                    {(form.image && !availableImages.includes(form.image)
                      ? [form.image, ...availableImages]
                      : availableImages
                    ).map((img) => (
                      <option key={img} value={img}>
                        {imageLabel(img)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-warmgrey mb-2">
                    Linked services ({form.serviceIds.length} selected)
                  </label>
                  {catalogServices.length === 0 ? (
                    <p className="text-xs text-warmgrey">Add services first under Services.</p>
                  ) : (
                    <div className="max-h-40 overflow-y-auto border border-lightstone rounded-xl p-3 space-y-2 bg-gray-50">
                      {catalogServices.map((s) => (
                        <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={form.serviceIds.includes(s.id)}
                            onChange={() => toggleService(s.id)}
                            className="rounded border-lightstone text-terracotta focus:ring-terracotta/30"
                          />
                          <span className="text-charcoal">{s.name}</span>
                          <span className="text-xs text-warmgrey">({s.category})</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                {formError && <p className="text-xs text-rosewood">{formError}</p>}
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      setEditing(null);
                    }}
                    className="px-4 py-2 text-sm font-semibold text-warmgrey bg-accent-50 hover:bg-lightstone rounded-xl transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2 text-sm font-bold bg-terracotta hover:bg-accent-700 text-white rounded-xl shadow-sm shadow-soft transition disabled:opacity-60"
                  >
                    {saving ? "Saving…" : editing ? "Update" : "Create"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </ModalPortal>
      )}

      {deleteId && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/20 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm border border-lightstone p-6">
              <h3 className="text-base font-bold text-charcoal">Delete help moment?</h3>
              <p className="text-sm text-warmgrey mt-2">
                This removes the moment and its service links. The storefront link will 404.
              </p>
              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={() => setDeleteId(null)}
                  className="px-4 py-2 text-sm font-semibold text-warmgrey bg-accent-50 hover:bg-lightstone rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-5 py-2 text-sm font-bold bg-rosewood hover:bg-rosewood/90 text-white rounded-xl transition disabled:opacity-60"
                >
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  );
}
