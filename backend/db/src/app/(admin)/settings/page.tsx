"use client";

import { useState, useEffect } from "react";
import {
  Save, AlertCircle, CheckCircle, User, Bell, Lock,
  Mail, ShieldCheck, Eye, EyeOff, LogOut,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const inputCls = "w-full px-3 py-2 text-sm bg-gray-50 border border-lightstone rounded-xl focus:outline-none focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta transition placeholder:text-warmgrey";

function SectionHeader({ icon: Icon, title, desc, color }: { icon: any; title: string; desc: string; color: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon size={16} className="text-white" />
      </div>
      <div>
        <h2 className="text-sm font-bold text-charcoal">{title}</h2>
        <p className="text-xs text-warmgrey mt-0.5">{desc}</p>
      </div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${
        checked ? "bg-terracotta" : "bg-lightstone"
      }`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
        checked ? "translate-x-4.5" : "translate-x-0.5"
      }`} style={{ transform: checked ? "translateX(18px)" : "translateX(2px)" }} />
    </button>
  );
}

export default function SettingsPage() {
  const { user, logout } = useAuth();

  const [profile, setProfile] = useState({ name: "", email: "", role: "" });
  const [loading, setLoading]   = useState(false);
  const [saved, setSaved]       = useState(false);
  const [error, setError]       = useState("");

  const [notifications, setNotifications] = useState({
    emailOrders:  true,
    emailUsers:   false,
    smsAlerts:    true,
    weeklyReport: true,
  });

  const [password, setPassword]             = useState({ current: "", new: "", confirm: "" });
  const [showPw, setShowPw]                 = useState({ current: false, new: false, confirm: false });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError]   = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");

  useEffect(() => {
    if (user) {
      setProfile({ name: user.name || "", email: user.email || "", role: user.role || "" });
    }
  }, [user]);

  async function handleSaveProfile() {
    if (!user) return;
    setError(""); setLoading(true);
    try {
      const res = await fetch("/api/auth/update-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, name: profile.name, email: profile.email }),
      });
      const data = await res.json();
      if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2500); }
      else setError(data.error || "Failed to update profile");
    } catch { setError("Failed to update profile"); }
    finally { setLoading(false); }
  }

  async function handleChangePassword() {
    if (!user) return;
    setPasswordError(""); setPasswordSuccess("");
    if (password.new !== password.confirm) { setPasswordError("New passwords do not match"); return; }
    if (password.new.length < 6) { setPasswordError("Password must be at least 6 characters"); return; }
    setPasswordLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, currentPassword: password.current, newPassword: password.new }),
      });
      const data = await res.json();
      if (res.ok) {
        setPasswordSuccess("Password changed successfully");
        setPassword({ current: "", new: "", confirm: "" });
        setTimeout(() => setPasswordSuccess(""), 3000);
      } else setPasswordError(data.error || "Failed to change password");
    } catch { setPasswordError("Failed to change password"); }
    finally { setPasswordLoading(false); }
  }

  // Avatar initials
  const initials = profile.name
    ? profile.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)
    : "AD";

  return (
    <div className="max-w-2xl space-y-4 pb-8">

      {/* Profile card — avatar + name hero */}
      <div className="bg-white rounded-2xl border border-lightstone shadow-sm overflow-hidden">
        {/* Banner */}
        <div className="relative h-24 bg-gradient-to-r from-terracotta via-terracotta to-terracotta">
          {/* Avatar overlapping banner bottom */}
          <div className="absolute -bottom-8 left-6">
            <div className="w-16 h-16 rounded-2xl bg-terracotta ring-4 ring-white flex items-center justify-center text-white text-xl font-extrabold shadow-md">
              {initials}
            </div>
          </div>
        </div>
        <div className="px-6 pb-5">
          {/* Space for the overlapping avatar + name row */}
          <div className="flex items-start justify-between mt-10 mb-5">
            <div>
              <p className="text-base font-bold text-charcoal">{profile.name || "—"}</p>
              <p className="text-xs text-warmgrey mt-0.5">{profile.email || "—"}</p>
            </div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-accent-50 text-terracotta text-xs font-semibold rounded-xl ring-1 ring-terracotta/20 mt-1">
              <ShieldCheck size={12} />
              {profile.role || "admin"}
            </span>
          </div>

          <SectionHeader icon={User} title="Profile Settings" desc="Update your display name and email" color="bg-terracotta" />

          {error && (
            <div className="mb-4 flex items-center gap-2 px-3 py-2.5 bg-dustyrose/10 border border-dustyrose/20 rounded-xl text-sm text-rosewood">
              <AlertCircle size={14} className="shrink-0" /> {error}
            </div>
          )}

          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-warmgrey mb-1.5">Full Name</label>
                <input type="text" value={profile.name}
                  onChange={e => setProfile({ ...profile, name: e.target.value })}
                  placeholder="Your name" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-warmgrey mb-1.5">Email Address</label>
                <div className="relative">
                  <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-warmgrey" />
                  <input type="email" value={profile.email}
                    onChange={e => setProfile({ ...profile, email: e.target.value })}
                    placeholder="you@example.com" className={`${inputCls} pl-8`} />
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-warmgrey mb-1.5">Role</label>
              <input type="text" value={profile.role} readOnly
                className={`${inputCls} cursor-not-allowed opacity-60`} />
            </div>
          </div>

          <div className="flex justify-end mt-4">
            <button onClick={handleSaveProfile} disabled={loading}
              className={`inline-flex items-center gap-2 px-5 py-2 text-sm font-bold rounded-xl transition shadow-sm disabled:opacity-60 ${
                saved
                  ? "bg-sage text-white shadow-soft"
                  : "bg-terracotta hover:bg-accent-700 text-white shadow-soft"
              }`}>
              {saved ? <CheckCircle size={14} /> : <Save size={14} />}
              {loading ? "Saving…" : saved ? "Saved!" : "Save Profile"}
            </button>
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="bg-white rounded-2xl border border-lightstone shadow-sm p-6">
        <SectionHeader icon={Bell} title="Notification Preferences" desc="Choose what alerts you receive" color="bg-terracotta" />
        <div className="space-y-0 divide-y divide-lightstone/50">
          {[
            { key: "emailOrders",  label: "New order emails",          desc: "Receive an email whenever a new booking is placed." },
            { key: "emailUsers",   label: "New user registrations",    desc: "Get notified when a new customer signs up."          },
            { key: "smsAlerts",    label: "SMS critical alerts",       desc: "Receive SMS notifications for system-level events."  },
            { key: "weeklyReport", label: "Weekly analytics digest",   desc: "A summary report every Monday morning."              },
          ].map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
              <div>
                <p className="text-sm font-semibold text-charcoal">{label}</p>
                <p className="text-xs text-warmgrey mt-0.5">{desc}</p>
              </div>
              <Toggle
                checked={notifications[key as keyof typeof notifications]}
                onChange={() => setNotifications(prev => ({ ...prev, [key]: !prev[key as keyof typeof notifications] }))}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Change Password */}
      <div className="bg-white rounded-2xl border border-lightstone shadow-sm p-6">
        <SectionHeader icon={Lock} title="Change Password" desc="Keep your account secure with a strong password" color="bg-terracotta" />

        {passwordError && (
          <div className="mb-4 flex items-center gap-2 px-3 py-2.5 bg-dustyrose/10 border border-dustyrose/20 rounded-xl text-sm text-rosewood">
            <AlertCircle size={14} className="shrink-0" /> {passwordError}
          </div>
        )}
        {passwordSuccess && (
          <div className="mb-4 flex items-center gap-2 px-3 py-2.5 bg-sage/10 border border-emerald-200 rounded-xl text-sm text-sage">
            <CheckCircle size={14} className="shrink-0" /> {passwordSuccess}
          </div>
        )}

        <div className="space-y-3">
          {([
            { field: "current", label: "Current Password",     placeholder: "Enter current password"  },
            { field: "new",     label: "New Password",         placeholder: "Min. 6 characters"        },
            { field: "confirm", label: "Confirm New Password", placeholder: "Repeat new password"      },
          ] as const).map(({ field, label, placeholder }) => (
            <div key={field}>
              <label className="block text-xs font-semibold text-warmgrey mb-1.5">{label}</label>
              <div className="relative">
                <input
                  type={showPw[field] ? "text" : "password"}
                  value={password[field]}
                  onChange={e => setPassword(p => ({ ...p, [field]: e.target.value }))}
                  placeholder={placeholder}
                  className={`${inputCls} pr-10`}
                />
                <button type="button"
                  onClick={() => setShowPw(p => ({ ...p, [field]: !p[field] }))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-warmgrey hover:text-warmgrey transition">
                  {showPw[field] ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          ))}
          <button onClick={handleChangePassword} disabled={passwordLoading}
            className="w-full mt-1 py-2.5 text-sm font-bold bg-terracotta hover:bg-accent-700 text-white rounded-xl transition shadow-sm shadow-soft disabled:opacity-60">
            {passwordLoading ? "Updating…" : "Update Password"}
          </button>
        </div>
      </div>

      {/* Danger zone — sign out */}
      <div className="bg-white rounded-2xl border border-dustyrose/20 shadow-sm p-6">
        <SectionHeader icon={LogOut} title="Session" desc="Sign out of the admin panel" color="bg-dustyrose" />
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-charcoal">Sign out</p>
            <p className="text-xs text-warmgrey mt-0.5">You will be redirected to the login page.</p>
          </div>
          <button onClick={logout}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold bg-dustyrose/10 text-rosewood hover:bg-dustyrose hover:text-white rounded-xl ring-1 ring-dustyrose/20 transition">
            <LogOut size={13} /> Sign Out
          </button>
        </div>
      </div>

    </div>
  );
}
