"use client";

import React, { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import {
  Search, UserPlus, X, Trash2, Download,
  Users, ShoppingCart, DollarSign, MapPin, Phone, Mail, Calendar,
} from "lucide-react";
import clsx from "clsx";
import ModalPortal from "@/components/ModalPortal";

type Customer = {
  id: number | string;
  name: string;
  email: string | null;
  mobile: string;
  city: string;
  totalOrders: number;
  totalSpend: number;
  status: "Active" | "Inactive";
  joined: string;
  avatar: string;
};

type CustomerForm = {
  name: string;
  email: string;
  mobile: string;
  city: string;
  totalOrders: number;
  totalSpend: number;
  status: "Active" | "Inactive";
};

const avatarColors = [
  "bg-terracotta", "bg-sage", "bg-terracotta",
  "bg-dustyrose",   "bg-terracotta",     "bg-terracotta",
];

const statusCfg: Record<string, { cls: string; dot: string }> = {
  Active:   { cls: "bg-sage/10 text-sage ring-1 ring-sage/20", dot: "bg-sage" },
  Inactive: { cls: "bg-accent-50 text-warmgrey ring-1 ring-lightstone",         dot: "bg-lightstone" },
  Suspended:{ cls: "bg-dustyrose/10 text-rosewood ring-1 ring-dustyrose/20",             dot: "bg-dustyrose" },
};

const defaultForm: CustomerForm = {
  name: "", email: "", mobile: "", city: "", totalOrders: 0, totalSpend: 0, status: "Active",
};

function getInitials(name: string) {
  return (name || "?").trim().split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

export default function CustomersPage() {
  const [customers, setCustomers]   = useState<Customer[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [showModal, setShowModal]   = useState(false);
  const [form, setForm]             = useState<CustomerForm>(defaultForm);
  const [errors, setErrors]         = useState<Partial<CustomerForm>>({});
  const [expandedRow, setExpandedRow] = useState<number | string | null>(null);

  useEffect(() => { loadCustomers(); }, []);

  async function loadCustomers() {
    setLoading(true);
    try {
      const res  = await fetch("/api/clients");
      const json = await res.json();
      if (Array.isArray(json.data)) setCustomers(json.data);
    } catch (err) {
      console.error("Failed to fetch clients", err);
    } finally {
      setLoading(false);
    }
  }

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase();
    const matchSearch =
      (c.name  || "").toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q) ||
      (c.mobile || "").includes(q) ||
      (c.city  || "").toLowerCase().includes(q);
    const matchStatus = statusFilter === "All" || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // Summary stats
  const totalSpend   = customers.reduce((s, c) => s + Number(c.totalSpend  || 0), 0);
  const totalOrders  = customers.reduce((s, c) => s + Number(c.totalOrders || 0), 0);
  const activeCount  = customers.filter(c => c.status === "Active").length;

  function validate() {
    const e: Partial<CustomerForm> = {};
    if (!form.name.trim())   e.name   = "Name is required.";
    if (!form.mobile.trim()) e.mobile = "Mobile is required.";
    if (!form.city.trim())   e.city   = "City is required.";
    return e;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    setCustomers(prev => [...prev, {
      id: Date.now(), ...form,
      joined: today,
      avatar: getInitials(form.name),
    }]);
    setForm(defaultForm);
    setErrors({});
    setShowModal(false);
  }

  function handleClose() {
    setShowModal(false);
    setForm(defaultForm);
    setErrors({});
  }

  function handleExport() {
    const exportData = filtered.map(({ avatar, id, ...rest }) => rest);
    const ws  = XLSX.utils.json_to_sheet(exportData);
    const wb  = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Clients");
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([out], { type: "application/octet-stream" }), "clients.xlsx");
  }

  const inputCls = "w-full px-3 py-2 text-sm bg-gray-50 border border-lightstone rounded-xl focus:outline-none focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta transition placeholder:text-warmgrey";

  return (
    <>
      <div className="space-y-5 pb-6">

        {/* Summary cards */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            { label: "Total Customers", value: customers.length.toLocaleString(),        icon: Users,         color: "bg-terracotta"  },
            { label: "Active",          value: activeCount.toLocaleString(),              icon: Users,         color: "bg-sage" },
            { label: "Total Orders",    value: totalOrders.toLocaleString(),              icon: ShoppingCart,  color: "bg-terracotta"  },
            { label: "Total Revenue",   value: `S$${totalSpend.toLocaleString()}`,         icon: DollarSign,   color: "bg-terracotta"  },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-white rounded-2xl border border-lightstone shadow-sm p-5">
              <div className="flex items-start justify-between mb-3">
                <div className={clsx("w-10 h-10 rounded-xl flex items-center justify-center", color)}>
                  <Icon size={18} className="text-white" />
                </div>
              </div>
              <p className="text-xl font-bold text-charcoal">{value}</p>
              <p className="text-sm text-warmgrey mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-warmgrey" />
              <input
                type="text"
                placeholder="Search by name, mobile, city…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-4 py-2 text-sm bg-white border border-lightstone rounded-xl focus:outline-none focus:ring-2 focus:ring-terracotta/30 w-64 transition"
              />
            </div>
            {/* Status filter */}
            <div className="flex items-center gap-1 bg-accent-50 rounded-xl p-1">
              {["All", "Active", "Inactive"].map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={clsx(
                    "text-xs font-semibold px-3 py-1.5 rounded-lg transition",
                    statusFilter === s
                      ? "bg-white text-charcoal shadow-sm"
                      : "text-warmgrey hover:text-terracotta"
                  )}
                >{s}</button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-warmgrey bg-white border border-lightstone hover:border-lightstone px-3 py-2 rounded-xl transition shadow-sm"
            >
              <Download size={14} /> Export
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-1.5 text-sm font-semibold bg-terracotta hover:bg-accent-700 text-white px-4 py-2 rounded-xl transition shadow-sm shadow-soft"
            >
              <UserPlus size={14} /> Add Customer
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-lightstone shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <div className="flex gap-1.5">
                  {[0,1,2].map(i => (
                    <div key={i} className="w-2 h-2 rounded-full bg-terracotta animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
                <p className="text-sm text-warmgrey">Loading customers…</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-lightstone">
                    {["Customer", "Mobile", "City", "Orders", "Total Spend", "Status", "Joined", ""].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-warmgrey uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-lightstone/50">
                  {filtered.map((client, i) => {
                    const st = statusCfg[client.status] ?? statusCfg["Inactive"];
                    const isExpanded = expandedRow === client.id;
                    return (
                      <React.Fragment key={client.id}>
                        <tr
                          className="hover:bg-accent-50/70 transition cursor-pointer"
                          onClick={() => setExpandedRow(isExpanded ? null : client.id)}
                        >
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              <div className={clsx("w-8 h-8 rounded-xl flex items-center justify-center text-white text-[11px] font-bold shrink-0", avatarColors[i % avatarColors.length])}>
                                {getInitials(client.name)}
                              </div>
                              <div>
                                <p className="font-semibold text-charcoal leading-tight">{client.name}</p>
                                {client.email && <p className="text-[11px] text-warmgrey leading-tight">{client.email}</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-warmgrey whitespace-nowrap">{client.mobile || "—"}</td>
                          <td className="px-4 py-3 text-warmgrey whitespace-nowrap">{client.city || "—"}</td>
                          <td className="px-4 py-3 font-semibold text-charcoal whitespace-nowrap">{client.totalOrders ?? 0}</td>
                          <td className="px-4 py-3 font-semibold text-charcoal whitespace-nowrap">S${Number(client.totalSpend || 0).toLocaleString()}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={clsx("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[11px] font-semibold", st.cls)}>
                              <span className={clsx("w-1.5 h-1.5 rounded-full", st.dot)} />
                              {client.status || "Active"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-warmgrey text-xs whitespace-nowrap">{client.joined || "—"}</td>
                          <td className="px-4 py-3 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => setCustomers(prev => prev.filter(c => c.id !== client.id))}
                              className="p-1.5 rounded-lg hover:bg-dustyrose/10 text-warmgrey hover:text-rosewood transition"
                              title="Remove"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${client.id}-expand`} className="bg-accent-50/40">
                            <td colSpan={8} className="px-6 py-4">
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                                <div className="flex items-center gap-2 text-warmgrey">
                                  <Phone size={13} className="text-terracotta shrink-0" />
                                  <span>{client.mobile || "—"}</span>
                                </div>
                                <div className="flex items-center gap-2 text-warmgrey">
                                  <Mail size={13} className="text-terracotta shrink-0" />
                                  <span className="truncate">{client.email || "—"}</span>
                                </div>
                                <div className="flex items-center gap-2 text-warmgrey">
                                  <MapPin size={13} className="text-terracotta shrink-0" />
                                  <span>{client.city || "—"}</span>
                                </div>
                                <div className="flex items-center gap-2 text-warmgrey">
                                  <Calendar size={13} className="text-terracotta shrink-0" />
                                  <span>Joined: {client.joined || "—"}</span>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div className="text-center py-16">
                  <Users size={32} className="text-lightstone mx-auto mb-3" />
                  <p className="text-sm text-warmgrey">No customers found.</p>
                </div>
              )}
            </div>
          )}
          {/* Footer count */}
          {!loading && filtered.length > 0 && (
            <div className="px-4 py-3 border-t border-lightstone/50 text-xs text-warmgrey">
              Showing <span className="font-semibold text-warmgrey">{filtered.length}</span> of <span className="font-semibold text-warmgrey">{customers.length}</span> customers
            </div>
          )}
        </div>
      </div>

      {/* Add Customer Modal */}
      {showModal && (
        <ModalPortal>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/20">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 border border-lightstone overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-lightstone">
              <div>
                <h2 className="text-base font-bold text-charcoal">Add New Customer</h2>
                <p className="text-xs text-warmgrey mt-0.5">Fill in the details below</p>
              </div>
              <button onClick={handleClose} className="p-1.5 hover:bg-accent-50 rounded-lg transition">
                <X size={16} className="text-warmgrey" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-warmgrey mb-1.5">Full Name *</label>
                  <input type="text" placeholder="e.g. Rahul Sharma" value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} />
                  {errors.name && <p className="text-xs text-rosewood mt-1">{errors.name}</p>}
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-warmgrey mb-1.5">Email</label>
                  <input type="email" placeholder="e.g. rahul@example.com" value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })} className={inputCls} />
                  {errors.email && <p className="text-xs text-rosewood mt-1">{errors.email}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-warmgrey mb-1.5">Mobile *</label>
                  <input type="text" placeholder="9876543210" value={form.mobile}
                    onChange={e => setForm({ ...form, mobile: e.target.value })} className={inputCls} />
                  {errors.mobile && <p className="text-xs text-rosewood mt-1">{errors.mobile}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-warmgrey mb-1.5">City *</label>
                  <input type="text" placeholder="Mumbai" value={form.city}
                    onChange={e => setForm({ ...form, city: e.target.value })} className={inputCls} />
                  {errors.city && <p className="text-xs text-rosewood mt-1">{errors.city}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-warmgrey mb-1.5">Total Orders</label>
                  <input type="number" min="0" value={form.totalOrders}
                    onChange={e => setForm({ ...form, totalOrders: Number(e.target.value) })} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-warmgrey mb-1.5">Total Spend (S$)</label>
                  <input type="number" min="0" value={form.totalSpend}
                    onChange={e => setForm({ ...form, totalSpend: Number(e.target.value) })} className={inputCls} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-warmgrey mb-1.5">Status</label>
                  <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as "Active" | "Inactive" })} className={inputCls}>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={handleClose}
                  className="px-4 py-2 text-sm font-semibold text-warmgrey bg-accent-50 hover:bg-lightstone rounded-xl transition">
                  Cancel
                </button>
                <button type="submit"
                  className="px-5 py-2 text-sm font-bold bg-terracotta hover:bg-accent-700 text-white rounded-xl shadow-sm shadow-soft transition">
                  Add Customer
                </button>
              </div>
            </form>
          </div>
        </div>
        </ModalPortal>
      )}
    </>
  );
}
