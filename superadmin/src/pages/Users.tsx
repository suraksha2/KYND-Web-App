import { useState, useEffect } from "react";
import { Search, UserPlus, MoreVertical, X } from "lucide-react";
import clsx from "clsx";
import { apiFetch } from "@/lib/api";

type User = {
  id: number;
  name: string;
  email: string;
  role: string;
  status: string;
  joined: string;
  avatar: string;
};

const initialUsers: User[] = [];

const statusStyles: Record<string, string> = {
  Active: "bg-sage/10 text-sage",
  Inactive: "bg-accent-50 text-warmgrey",
  Suspended: "bg-dustyrose/10 text-rosewood",
};

const roleColors: Record<string, string> = {
  Admin: "text-terracotta bg-accent-50",
  Editor: "text-terracotta bg-accent-100",
  Viewer: "text-warmgrey bg-accent-50",
};

const avatarColors = ["bg-terracotta", "bg-sage", "bg-terracotta", "bg-dustyrose", "bg-sage"];

const defaultForm = { name: "", email: "", role: "Viewer", status: "Active" };

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [errors, setErrors] = useState<Partial<typeof defaultForm>>({});

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    try {
      const res = await apiFetch("/api/users");
      const json = await res.json();
      if (json.data) {
        const mappedUsers = json.data.map((user: any) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
          joined: user.joined,
          avatar: user.name.substring(0, 2).toUpperCase(),
        }));
        setUsers(mappedUsers);
      }
    } catch (err) {
      console.error("Failed to fetch users", err);
    } finally {
      setLoading(false);
    }
  }

  const filtered = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="text-warmgrey text-sm">Loading users...</div>
      </div>
    );
  }

  function validate() {
    const e: Partial<typeof defaultForm> = {};
    if (!form.name.trim()) e.name = "Name is required.";
    if (!form.email.trim()) e.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Invalid email.";
    else if (users.some((u) => u.email === form.email)) e.email = "Email already exists.";
    return e;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    const initials = form.name.trim().split(" ").map((w) => w[0].toUpperCase()).slice(0, 2).join("");
    const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    setUsers((prev) => [...prev, { id: Date.now(), ...form, joined: today, avatar: initials }]);
    setForm(defaultForm);
    setErrors({});
    setShowModal(false);
  }

  function handleClose() {
    setShowModal(false);
    setForm(defaultForm);
    setErrors({});
  }

  return (
    <>
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-warmgrey" />
          <input
            type="text"
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 text-sm border border-lightstone rounded-lg focus:outline-none focus:ring-2 focus:ring-terracotta w-64"
          />
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-terracotta hover:bg-accent-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition">
          <UserPlus size={15} />
          Add User
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-lightstone overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-warmgrey bg-gray-50 border-b border-lightstone">
                {["User", "Role", "Status", "Joined", "Actions"].map((h) => (
                  <th key={h} className="px-5 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((user, i) => (
                <tr key={user.id} className="border-b border-lightstone/50 hover:bg-accent-50 transition">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className={clsx("w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0", avatarColors[i % avatarColors.length])}>
                        {user.avatar}
                      </div>
                      <div>
                        <p className="font-medium text-charcoal">{user.name}</p>
                        <p className="text-xs text-warmgrey">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className={clsx("px-2.5 py-0.5 rounded-full text-xs font-medium", roleColors[user.role])}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={clsx("px-2.5 py-0.5 rounded-full text-xs font-medium", statusStyles[user.status])}>
                      {user.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-warmgrey">{user.joined}</td>
                  <td className="px-5 py-3">
                    <button className="p-1.5 hover:bg-accent-50 rounded-lg transition">
                      <MoreVertical size={16} className="text-warmgrey" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <p className="text-center text-warmgrey py-10">No users found.</p>
        )}
      </div>
    </div>

      {/* Add User Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-charcoal">Add New User</h2>
              <button onClick={handleClose} className="p-1.5 hover:bg-accent-50 rounded-lg transition">
                <X size={16} className="text-warmgrey" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-warmgrey mb-1">Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. John Doe"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-lightstone rounded-lg focus:outline-none focus:ring-2 focus:ring-terracotta"
                />
                {errors.name && <p className="text-xs text-rosewood mt-1">{errors.name}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-warmgrey mb-1">Email</label>
                <input
                  type="text"
                  placeholder="e.g. john@example.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-lightstone rounded-lg focus:outline-none focus:ring-2 focus:ring-terracotta"
                />
                {errors.email && <p className="text-xs text-rosewood mt-1">{errors.email}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-warmgrey mb-1">Role</label>
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-lightstone rounded-lg focus:outline-none focus:ring-2 focus:ring-terracotta"
                  >
                    <option>Admin</option>
                    <option>Editor</option>
                    <option>Viewer</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-warmgrey mb-1">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-lightstone rounded-lg focus:outline-none focus:ring-2 focus:ring-terracotta"
                  >
                    <option>Active</option>
                    <option>Inactive</option>
                    <option>Suspended</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={handleClose} className="px-4 py-2 text-sm font-medium text-warmgrey bg-accent-50 hover:bg-lightstone rounded-lg transition">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-terracotta hover:bg-accent-700 rounded-lg transition">
                  Add User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
