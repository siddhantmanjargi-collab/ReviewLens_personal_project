"use client";

import React, { useState } from "react";
import { Loader2, Moon, Sun, Lock, User, AlertCircle, Zap } from "lucide-react";

export interface AuthenticatedSessionUser {
  id: string;
  username: string;
  email?: string | null;
  displayName?: string | null;
  authProvider?: "supabase" | "demo_local";
  shortlistIds: string[];
  compareIds: string[];
  mutedCategories?: string[];
  strictTrustMode?: boolean;
  favoriteTimestamps?: Record<string, string>;
  updatedAt?: string;
}

interface LoginScreenProps {
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  supabaseConfigured: boolean;
  guestShortlistIds: string[];
  guestCompareIds: string[];
  onAuthenticated: (
    user: AuthenticatedSessionUser,
    sessionToken: string | null,
    supabaseConfigured?: boolean,
  ) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({
  isDarkMode,
  onToggleDarkMode,
  onAuthenticated,
}) => {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedId = identifier.trim();
    if (!trimmedId) {
      setErrorMessage("Please enter your username or email.");
      return;
    }
    if (!password) {
      setErrorMessage("Please enter your password.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          identifier: trimmedId,
          password,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok || !data?.user) {
        setErrorMessage(
          typeof data?.error === "string" ? data.error : "Invalid credentials. Please try again.",
        );
        return;
      }
      onAuthenticated(
        data.user as AuthenticatedSessionUser,
        typeof data.sessionToken === "string" ? data.sessionToken : null,
        Boolean(data.supabaseConfigured),
      );
    } catch {
      setErrorMessage("Network error while connecting to server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleFillDemo = () => {
    setIdentifier("analyst");
    setPassword("reviewlens");
    setErrorMessage(null);
  };

  return (
    <div className={isDarkMode ? "dark" : ""}>
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-4 transition-colors duration-150 relative">
        {/* Top Header Controls */}
        <div className="absolute top-4 right-4">
          <button
            type="button"
            onClick={onToggleDarkMode}
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title={isDarkMode ? "Switch to light theme" : "Switch to dark theme"}
          >
            {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
          </button>
        </div>

        {/* Clean Central Login Card */}
        <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl p-6 sm:p-8 space-y-6">
          {/* Brand Header */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-400 text-slate-950 font-bold text-xl shadow-xs mb-1">
              RL
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              ReviewLens Sign In
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Enter your username and password to access the application.
            </p>
          </div>

          {/* Error Notice */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-400 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Simple Form */}
          <form onSubmit={handleLoginSubmit} className="space-y-4" noValidate>
            {/* Username Field */}
            <div className="space-y-1.5">
              <label
                htmlFor="rl-username"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-200"
              >
                Username or Email
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="rl-username"
                  name="identifier"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  value={identifier}
                  onChange={(e) => {
                    setIdentifier(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder="e.g. analyst or siddhant"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-950 focus:border-slate-900 dark:focus:border-amber-400 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none transition-colors"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <label
                htmlFor="rl-password"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-200"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="rl-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder="Enter password"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-950 focus:border-slate-900 dark:focus:border-amber-400 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none transition-colors"
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[44px] py-2.5 px-4 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl inline-flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer disabled:opacity-60 active:scale-[0.99]"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
              ) : (
                <span>Sign In</span>
              )}
            </button>
          </form>

          {/* Quick Demo Fill Button */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 text-center space-y-2">
            <button
              type="button"
              onClick={handleFillDemo}
              className="text-xs font-medium text-amber-700 dark:text-amber-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Fill Demo Credentials (@analyst / reviewlens)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
