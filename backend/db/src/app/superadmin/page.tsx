"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Lock, Mail, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    console.log("Form submitted with:", { email, password });
    const success = await login(email, password);
    console.log("Login result:", success);
    if (success) {
      console.log("Redirecting to /dashboard");
      router.push("/dashboard");
    } else {
      console.log("Showing error");
      setError("Invalid email or password");
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-warmlinen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-soft p-8 border border-lightstone">
          {/* Logo */}
          <div className="text-center mb-6">
            <h1 className="font-heading text-4xl font-bold lowercase tracking-tight text-terracotta">kynd</h1>
            <h2 className="mt-4 font-heading text-2xl font-bold text-charcoal">Admin Login</h2>
            <p className="text-warmgrey text-center mt-1.5">
              Enter your credentials to access the dashboard
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
              <AlertCircle size={16} className="text-red-600" />
              <span className="text-sm text-red-700">{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-charcoal mb-2">
                Email Address
              </label>
              <div className="relative">
                <Mail
                  size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-warmgrey"
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  className="w-full pl-10 pr-4 py-3 border border-lightstone rounded-xl focus:outline-none focus:ring-2 focus:ring-terracotta/40 focus:border-terracotta transition"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-charcoal mb-2">
                Password
              </label>
              <div className="relative">
                <Lock
                  size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-warmgrey"
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-3 border border-lightstone rounded-xl focus:outline-none focus:ring-2 focus:ring-terracotta/40 focus:border-terracotta transition"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-terracotta hover:bg-accent-600 text-white font-bold py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-terracotta/40 focus:ring-offset-2 focus:ring-offset-white transition disabled:opacity-50 disabled:cursor-not-allowed shadow-soft"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
