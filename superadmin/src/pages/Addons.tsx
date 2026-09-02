import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, X, Package, Link2, Tag } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import ModalPortal from '@/components/ModalPortal';
import { apiFetch } from '@/lib/api';

type Addon = {
  id: number;
  name: string;
  customer_price: number;
  partner_cost: number | null;
};

type CatalogService = {
  id: number;
  name: string;
  category: string;
};

type CatalogCategory = {
  id: number;
  name: string;
};

type AddonLink = {
  link_id: number;
  service_id: number | null;
  category_id: number | null;
  service_name: string | null;
  category_name: string | null;
};

const defaultAddonForm = { name: '', customer_price: '', partner_cost: '' };

const inputCls =
  'w-full px-3 py-2 text-sm bg-gray-50 border border-lightstone rounded-xl focus:outline-none focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta transition placeholder:text-warmgrey';

export default function AddonsPage() {
  const [addons, setAddons] = useState<Addon[]>([]);
  const [services, setServices] = useState<CatalogService[]>([]);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAddonModal, setShowAddonModal] = useState(false);
  const [editingAddon, setEditingAddon] = useState<Addon | null>(null);
  const [addonForm, setAddonForm] = useState(defaultAddonForm);
  const [addonFormError, setAddonFormError] = useState<string | null>(null);
  const [savingAddon, setSavingAddon] = useState(false);

  const [deleteAddonId, setDeleteAddonId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [linkingAddon, setLinkingAddon] = useState<Addon | null>(null);
  const [linkForm, setLinkForm] = useState({ targetType: 'service' as 'service' | 'category', targetId: '' });
  const [linkLinks, setLinkLinks] = useState<AddonLink[]>([]);
  const [linkError, setLinkError] = useState<string | null>(null);

  const [searchParams] = useSearchParams();
  const query = searchParams.get('q')?.toLowerCase() ?? '';

  const fetchAddons = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/addons');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to load add-ons.');
      setAddons(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load add-ons.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAddons();
    apiFetch('/api/catalog/services')
      .then((res) => res.json())
      .then((json) => setServices(json.data ?? []))
      .catch((err) => console.error('Failed to fetch catalog services', err));
    apiFetch('/api/catalog/categories')
      .then((res) => res.json())
      .then((json) => setCategories(json.data ?? []))
      .catch((err) => console.error('Failed to fetch catalog categories', err));
  }, []);

  const filteredAddons = useMemo(() => {
    const q = query.trim();
    const list = q
      ? addons.filter((a) => a.name.toLowerCase().includes(q))
      : [...addons];
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [addons, query]);

  function openCreateAddon() {
    setEditingAddon(null);
    setAddonForm(defaultAddonForm);
    setAddonFormError(null);
    setShowAddonModal(true);
  }

  function openEditAddon(addon: Addon) {
    setEditingAddon(addon);
    setAddonForm({
      name: addon.name,
      customer_price: String(addon.customer_price),
      partner_cost: addon.partner_cost !== null ? String(addon.partner_cost) : '',
    });
    setAddonFormError(null);
    setShowAddonModal(true);
  }

  async function handleSaveAddon(e: React.FormEvent) {
    e.preventDefault();
    if (!addonForm.name.trim()) {
      setAddonFormError('Add-on name is required.');
      return;
    }
    if (!addonForm.customer_price.trim()) {
      setAddonFormError('Customer price is required.');
      return;
    }

    setSavingAddon(true);
    setAddonFormError(null);

    try {
      const url = editingAddon ? `/api/addons/${editingAddon.id}` : '/api/addons';
      const method = editingAddon ? 'PUT' : 'POST';
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: addonForm.name.trim(),
          customer_price: Number(addonForm.customer_price),
          partner_cost: addonForm.partner_cost.trim() ? Number(addonForm.partner_cost) : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to save add-on.');

      setShowAddonModal(false);
      setEditingAddon(null);
      setAddonForm(defaultAddonForm);
      await fetchAddons();
    } catch (err) {
      setAddonFormError(err instanceof Error ? err.message : 'Failed to save add-on.');
    } finally {
      setSavingAddon(false);
    }
  }

  async function handleDeleteAddon() {
    if (!deleteAddonId) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/addons/${deleteAddonId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete add-on.');
      setDeleteAddonId(null);
      await fetchAddons();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete add-on.');
    } finally {
      setDeleting(false);
    }
  }

  async function openLinkModal(addon: Addon) {
    setLinkingAddon(addon);
    setLinkForm({ targetType: 'service', targetId: '' });
    setLinkError(null);
    try {
      const res = await apiFetch(`/api/addons/${addon.id}/links`);
      const json = await res.json();
      setLinkLinks((json.data ?? []) as AddonLink[]);
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : 'Failed to load links.');
    }
  }

  async function handleLinkSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!linkForm.targetId || !linkingAddon) {
      setLinkError('Select a service or category.');
      return;
    }
    try {
      const body: any = { addon_id: linkingAddon.id };
      if (linkForm.targetType === 'service') body.service_id = Number(linkForm.targetId);
      else body.category_id = Number(linkForm.targetId);

      const res = await apiFetch(`/api/addons/${linkingAddon.id}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to link add-on.');

      setLinkForm({ ...linkForm, targetId: '' });
      await openLinkModal(linkingAddon);
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : 'Failed to link add-on.');
    }
  }

  async function handleUnlink(linkId: number) {
    if (!linkingAddon) return;
    try {
      const res = await apiFetch(`/api/addons/links/${linkId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to remove link.');
      await openLinkModal(linkingAddon);
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : 'Failed to remove link.');
    }
  }

  return (
    <div className="space-y-6 pb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-bold text-charcoal">Add-ons</h1>
          <p className="text-xs text-warmgrey mt-0.5">Extras that can be attached to a service or whole category.</p>
        </div>
        <button
          onClick={openCreateAddon}
          className="inline-flex items-center gap-1.5 text-sm font-semibold bg-terracotta hover:bg-accent-700 text-white px-4 py-2 rounded-xl transition shadow-sm shadow-soft"
        >
          <Plus size={14} /> Add Add-on
        </button>
      </div>

      {error && (
        <p className="px-4 py-3 text-sm text-rosewood bg-dustyrose/10 border border-dustyrose/20 rounded-xl">{error}</p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 bg-white rounded-2xl border border-lightstone">
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
      ) : filteredAddons.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-lightstone">
          <Package size={32} className="text-lightstone mx-auto mb-3" />
          <p className="text-sm text-warmgrey">{query ? 'No add-ons match your search.' : 'No add-ons yet.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredAddons.map((addon) => (
            <div key={addon.id} className="bg-white rounded-2xl border border-lightstone shadow-sm p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-bold text-charcoal">{addon.name}</p>
                  <p className="text-[11px] text-warmgrey mt-0.5">
                    S${Number(addon.customer_price).toFixed(2)} customer
                    {addon.partner_cost !== null && ` · S$${Number(addon.partner_cost).toFixed(2)} partner`}
                  </p>
                </div>
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => openLinkModal(addon)}
                    className="p-1.5 rounded-lg text-warmgrey hover:text-terracotta hover:bg-accent-50 transition"
                    title="Link to service / category"
                  >
                    <Link2 size={14} />
                  </button>
                  <button
                    onClick={() => openEditAddon(addon)}
                    className="p-1.5 rounded-lg text-warmgrey hover:text-terracotta hover:bg-accent-50 transition"
                    title="Edit"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => setDeleteAddonId(addon.id)}
                    className="p-1.5 rounded-lg text-warmgrey hover:text-rosewood hover:bg-dustyrose/10 transition"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Add-on Modal */}
      {showAddonModal && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/20 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm border border-lightstone overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-lightstone">
                <div>
                  <h2 className="text-base font-bold text-charcoal">{editingAddon ? 'Edit Add-on' : 'Add Add-on'}</h2>
                  <p className="text-xs text-warmgrey mt-0.5">Customer price and optional partner cost</p>
                </div>
                <button
                  onClick={() => { setShowAddonModal(false); setEditingAddon(null); }}
                  className="p-1.5 hover:bg-accent-50 rounded-lg transition"
                >
                  <X size={16} className="text-warmgrey" />
                </button>
              </div>
              <form onSubmit={handleSaveAddon} className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-warmgrey mb-1.5">Name *</label>
                  <input
                    type="text"
                    value={addonForm.name}
                    onChange={(e) => setAddonForm((p) => ({ ...p, name: e.target.value }))}
                    className={inputCls}
                    placeholder="e.g. Cleaning supplies"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-warmgrey mb-1.5">Customer price *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={addonForm.customer_price}
                      onChange={(e) => setAddonForm((p) => ({ ...p, customer_price: e.target.value }))}
                      className={inputCls}
                      placeholder="5.00"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-warmgrey mb-1.5">Partner cost</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={addonForm.partner_cost}
                      onChange={(e) => setAddonForm((p) => ({ ...p, partner_cost: e.target.value }))}
                      className={inputCls}
                      placeholder="3.50"
                    />
                  </div>
                </div>
                {addonFormError && <p className="text-xs text-rosewood">{addonFormError}</p>}
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => { setShowAddonModal(false); setEditingAddon(null); }}
                    className="px-4 py-2 text-sm font-semibold text-warmgrey bg-accent-50 hover:bg-lightstone rounded-xl transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingAddon}
                    className="px-5 py-2 text-sm font-bold bg-terracotta hover:bg-accent-700 text-white rounded-xl shadow-sm shadow-soft transition disabled:opacity-60"
                  >
                    {savingAddon ? 'Saving…' : editingAddon ? 'Update' : 'Add Add-on'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Link Add-on Modal */}
      {linkingAddon && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/20 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-lightstone overflow-hidden max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-lightstone shrink-0">
                <div>
                  <h2 className="text-base font-bold text-charcoal">Link {linkingAddon.name}</h2>
                  <p className="text-xs text-warmgrey mt-0.5">Attach to a catalog service or category</p>
                </div>
                <button onClick={() => setLinkingAddon(null)} className="p-1.5 hover:bg-accent-50 rounded-lg transition">
                  <X size={16} className="text-warmgrey" />
                </button>
              </div>

              <form onSubmit={handleLinkSubmit} className="px-6 py-5 space-y-4 shrink-0">
                <div className="flex gap-3">
                  <label className="flex items-center gap-1.5 text-sm text-charcoal cursor-pointer">
                    <input
                      type="radio"
                      checked={linkForm.targetType === 'service'}
                      onChange={() => setLinkForm((p) => ({ ...p, targetType: 'service', targetId: '' }))}
                    />
                    Service
                  </label>
                  <label className="flex items-center gap-1.5 text-sm text-charcoal cursor-pointer">
                    <input
                      type="radio"
                      checked={linkForm.targetType === 'category'}
                      onChange={() => setLinkForm((p) => ({ ...p, targetType: 'category', targetId: '' }))}
                    />
                    Category
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-warmgrey mb-1.5">Select {linkForm.targetType}</label>
                  <select
                    value={linkForm.targetId}
                    onChange={(e) => setLinkForm((p) => ({ ...p, targetId: e.target.value }))}
                    className={inputCls}
                  >
                    <option value="">—</option>
                    {(linkForm.targetType === 'service' ? services : categories).map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>

                {linkError && <p className="text-xs text-rosewood">{linkError}</p>}

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setLinkingAddon(null)}
                    className="px-4 py-2 text-sm font-semibold text-warmgrey bg-accent-50 hover:bg-lightstone rounded-xl transition"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-sm font-bold bg-terracotta hover:bg-accent-700 text-white rounded-xl shadow-sm shadow-soft transition"
                  >
                    Link
                  </button>
                </div>
              </form>

              <div className="px-6 pb-5 flex-1 overflow-y-auto">
                <p className="text-xs font-semibold text-warmgrey mb-2">Existing links</p>
                {linkLinks.length === 0 ? (
                  <p className="text-xs text-warmgrey">Not linked yet.</p>
                ) : (
                  <div className="space-y-2">
                    {linkLinks.map((link) => (
                      <div
                        key={link.link_id}
                        className="flex items-center justify-between gap-3 px-3 py-2 bg-gray-50 rounded-xl border border-lightstone"
                      >
                        <div className="flex items-center gap-2 text-sm text-charcoal min-w-0">
                          {link.service_id ? <Package size={14} className="text-warmgrey shrink-0" /> : <Tag size={14} className="text-warmgrey shrink-0" />}
                          <span className="truncate">{link.service_name ?? link.category_name ?? `ID ${link.service_id ?? link.category_id}`}</span>
                        </div>
                        <button
                          onClick={() => handleUnlink(link.link_id)}
                          className="p-1.5 rounded-lg text-warmgrey hover:text-rosewood hover:bg-dustyrose/10 transition"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </ModalPortal>
      )}

      {/* Delete Confirm */}
      {deleteAddonId !== null && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/20 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 border border-lightstone space-y-4">
              <div className="w-10 h-10 rounded-xl bg-dustyrose/10 flex items-center justify-center mb-1">
                <Trash2 size={18} className="text-rosewood" />
              </div>
              <div>
                <h3 className="text-base font-bold text-charcoal">Delete add-on?</h3>
                <p className="text-sm text-warmgrey mt-1">This will remove the add-on and all its links.</p>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setDeleteAddonId(null)}
                  className="px-4 py-2 text-sm font-semibold text-warmgrey bg-accent-50 hover:bg-lightstone rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAddon}
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
    </div>
  );
}
