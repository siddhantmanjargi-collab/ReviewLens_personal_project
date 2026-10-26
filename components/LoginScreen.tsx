"use client";

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { motion } from "motion/react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  Loader2,
  Mail,
  Moon,
  Sun,
  Zap,
} from "lucide-react";
import { heroShowcaseImg } from "@/components/ProductArtwork";

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

type AuthTab = "login" | "register" | "otp" | "reset";

const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const LoginScreen: React.FC<LoginScreenProps> = ({
  isDarkMode,
  onToggleDarkMode,
  supabaseConfigured,
  guestShortlistIds,
  guestCompareIds,
  onAuthenticated,
}) => {
  const [mode, setMode] = useState<AuthTab>("login");
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // OTP state
  const [otpSentTo, setOtpSentTo] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [previewOtpCode, setPreviewOtpCode] = useState<string | null>(null);

  // Password reset state
  const [resetNewPassword, setResetNewPassword] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"google" | "github" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [helperNotice, setHelperNotice] = useState<string | null>(null);

  const submitButtonRef = useRef<HTMLButtonElement | null>(null);

  // Listen for Supabase OAuth popup completion postMessage
  useEffect(() => {
    const onMessage = async (event: MessageEvent) => {
      if (!event.data || event.data.type !== "rl-supabase-auth-complete") return;
      setOauthLoading(null);
      if (!event.data.ok) {
        setErrorMessage(event.data.error || "OAuth sign-in did not complete.");
        return;
      }

      const accessToken =
        typeof event.data.accessToken === "string" ? event.data.accessToken : null;
      const headers: Record<string, string> = {};
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }

      try {
        const res = await fetch("/api/auth/me", {
          cache: "no-store",
          credentials: "include",
          headers,
        });
        const data = await res.json().catch(() => ({}));
        if (data?.authenticated && data?.user) {
          onAuthenticated(
            data.user as AuthenticatedSessionUser,
            accessToken,
            Boolean(data.supabaseConfigured),
          );
        } else {
          setErrorMessage("Signed in, but session cookies were blocked. Try Email Code sign-in.");
        }
      } catch {
        setErrorMessage("Could not verify OAuth session. Please try again.");
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onAuthenticated]);

  const switchMode = (nextMode: AuthTab) => {
    setMode(nextMode);
    setErrorMessage(null);
    setHelperNotice(null);
    if (nextMode !== "otp") {
      setOtpSentTo(null);
      setOtpCode("");
      setPreviewOtpCode(null);
    }
  };

  const handleFillDemoCredentials = () => {
    setMode("login");
    setIdentifier("analyst");
    setPassword("reviewlens");
    setErrorMessage(null);
    setHelperNotice("Demo credentials populated (@analyst) — press Sign In to enter.");
    setTimeout(() => {
      submitButtonRef.current?.focus();
    }, 30);
  };

  const handleQuick1ClickSignIn = async () => {
    setMode("login");
    setIdentifier("analyst");
    setPassword("reviewlens");
    setErrorMessage(null);
    setHelperNotice(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ identifier: "analyst", password: "reviewlens" }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.ok && data?.user) {
        onAuthenticated(
          data.user as AuthenticatedSessionUser,
          typeof data.sessionToken === "string" ? data.sessionToken : null,
          Boolean(data.supabaseConfigured),
        );
      } else {
        setErrorMessage("Could not complete quick sign in. Try entering analyst and reviewlens.");
      }
    } catch {
      setErrorMessage("Network error during quick sign in.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOAuthSignIn = async (provider: "google" | "github") => {
    if (oauthLoading || submitting) return;
    setErrorMessage(null);
    setHelperNotice(null);
    setOauthLoading(provider);

    try {
      const originParam = encodeURIComponent(window.location.origin);
      const res = await fetch(`/api/auth/oauth?provider=${provider}&origin=${originParam}`, {
        cache: "no-store",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok || typeof data?.url !== "string") {
        setErrorMessage(
          typeof data?.error === "string"
            ? data.error
            : `Could not start ${provider === "google" ? "Google" : "GitHub"} sign-in.`,
        );
        setOauthLoading(null);
        return;
      }

      // Open external Supabase OAuth provider authorization URL directly in popup
      const popup = window.open(data.url, "rl_supabase_oauth", "width=540,height=680");
      if (!popup) {
        setOauthLoading(null);
        setErrorMessage(
          "Your browser blocked the sign-in popup. Allow popups for this page or use Email Code sign-in.",
        );
      }
    } catch {
      setOauthLoading(null);
      setErrorMessage("Network error while starting OAuth sign-in.");
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setErrorMessage(null);
    setHelperNotice(null);

    if (mode === "login") {
      const trimmedId = identifier.trim();
      const looksEmail = trimmedId.includes("@") && !trimmedId.startsWith("@");
      if (looksEmail) {
        if (!EMAIL_PATTERN.test(trimmedId.toLowerCase())) {
          setErrorMessage("Enter a valid email address.");
          return;
        }
      } else {
        const cleanHandle = trimmedId.replace(/^@+/, "").toLowerCase();
        if (!USERNAME_PATTERN.test(cleanHandle)) {
          setErrorMessage(
            "Enter your email address or a 3–24 character @username.",
          );
          return;
        }
      }
      if (password.length < 6) {
        setErrorMessage("Password must be at least 6 characters long.");
        return;
      }

      setSubmitting(true);
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
            typeof data?.error === "string" ? data.error : "Invalid credentials.",
          );
          return;
        }
        onAuthenticated(
          data.user as AuthenticatedSessionUser,
          typeof data.sessionToken === "string" ? data.sessionToken : null,
          Boolean(data.supabaseConfigured),
        );
      } catch {
        setErrorMessage("Network error while contacting the server. Please try again.");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (mode === "register") {
      const trimmedEmail = email.trim().toLowerCase();
      if (!trimmedEmail || !EMAIL_PATTERN.test(trimmedEmail)) {
        setErrorMessage("Enter a valid email address for account recovery and sync.");
        return;
      }
      const cleanHandle = (username.trim() || trimmedEmail.split("@")[0] || "")
        .replace(/^@+/, "")
        .toLowerCase();
      if (!USERNAME_PATTERN.test(cleanHandle)) {
        setErrorMessage(
          "Username must be 3–24 characters using lowercase letters, numbers, or underscores.",
        );
        return;
      }
      if (password.length < 6) {
        setErrorMessage("Password must be at least 6 characters long.");
        return;
      }

      setSubmitting(true);
      try {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            email: trimmedEmail,
            username: cleanHandle,
            password,
            shortlistIds: guestShortlistIds,
            compareIds: guestCompareIds,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) {
          setErrorMessage(
            typeof data?.error === "string"
              ? data.error
              : "Could not create account. Try another email or username.",
          );
          return;
        }
        if (data.emailConfirmationRequired) {
          setMode("login");
          setIdentifier(trimmedEmail);
          setHelperNotice(
            typeof data.message === "string"
              ? data.message
              : "Confirmation email sent. Verify your email, then sign in.",
          );
          return;
        }
        if (data.user) {
          onAuthenticated(
            data.user as AuthenticatedSessionUser,
            typeof data.sessionToken === "string" ? data.sessionToken : null,
            Boolean(data.supabaseConfigured),
          );
        }
      } catch {
        setErrorMessage("Network error while creating account.");
      } finally {
        setSubmitting(false);
      }
    }
  };

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setErrorMessage(null);
    setHelperNotice(null);

    const targetEmail = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(targetEmail)) {
      setErrorMessage("Enter a valid email address to receive your 6-digit code.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: targetEmail }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setErrorMessage(typeof data?.error === "string" ? data.error : "Could not send code.");
        return;
      }
      setOtpSentTo(targetEmail);
      setPreviewOtpCode(typeof data.previewCode === "string" ? data.previewCode : null);
      setHelperNotice(
        typeof data.message === "string"
          ? data.message
          : `Sent a 6-digit sign-in code to ${targetEmail}.`,
      );
    } catch {
      setErrorMessage("Network error while requesting verification code.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || !otpSentTo) return;
    setErrorMessage(null);

    const trimmedCode = otpCode.trim();
    if (!/^\d{6}$/.test(trimmedCode)) {
      setErrorMessage("Enter the 6-digit numeric verification code.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: otpSentTo,
          code: trimmedCode,
          shortlistIds: guestShortlistIds,
          compareIds: guestCompareIds,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok || !data?.user) {
        setErrorMessage(
          typeof data?.error === "string" ? data.error : "Invalid or expired verification code.",
        );
        return;
      }
      onAuthenticated(
        data.user as AuthenticatedSessionUser,
        typeof data.sessionToken === "string" ? data.sessionToken : null,
        Boolean(data.supabaseConfigured),
      );
    } catch {
      setErrorMessage("Network error while verifying code.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setErrorMessage(null);
    setHelperNotice(null);

    const target = email.trim() || identifier.trim();
    if (!target) {
      setErrorMessage("Enter your registered email address.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: target,
          newPassword: supabaseConfigured ? undefined : resetNewPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setErrorMessage(
          typeof data?.error === "string" ? data.error : "Could not process password recovery.",
        );
        return;
      }
      setMode("login");
      setIdentifier(target);
      setPassword("");
      setResetNewPassword("");
      setHelperNotice(
        typeof data.message === "string"
          ? data.message
          : "Password recovery instructions sent.",
      );
    } catch {
      setErrorMessage("Network error while requesting password recovery.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={isDarkMode ? "dark" : ""}>
      <div className="min-h-screen flex flex-col justify-center bg-[#FAFAFA] dark:bg-slate-950 text-slate-900 dark:text-slate-50 px-4 sm:px-6 py-8 transition-colors duration-150">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-[1200px] mx-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch"
        >
          {/* Left Column: Editorial Marketplace & Buyer Profile Showcase */}
          <div className="lg:col-span-7 flex flex-col justify-between">
            <div className="p-6 sm:p-8 lg:p-10 space-y-6">
              <div className="flex items-center justify-between gap-4">
                <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
                  ReviewLens
                </span>
                <button
                  type="button"
                  onClick={onToggleDarkMode}
                  aria-label={isDarkMode ? "Switch to light theme" : "Switch to dark theme"}
                  className="px-3 py-2 min-h-[40px] text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-amber-500"
                >
                  {isDarkMode ? (
                    <>
                      <Sun className="w-3.5 h-3.5 text-amber-400" />
                      <span>Light</span>
                    </>
                  ) : (
                    <>
                      <Moon className="w-3.5 h-3.5 text-slate-700" />
                      <span>Dark</span>
                    </>
                  )}
                </button>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400 tabular-nums">
                  Verified Indian Marketplace Directory · 30 Products · 180 Audited Reviews
                </p>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-slate-900 dark:text-white leading-tight text-balance max-w-2xl">
                  Sign in to build your favourites-driven Buyer Profile and audit marketplace reviews.
                </h1>
                <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
                  Save and compare electronics across Amazon India and Flipkart to automatically map your preferred departments, INR budget sweet spot, and minimum review-authenticity standard.
                </p>
              </div>

              <div className="pt-5 border-t border-slate-200 dark:border-slate-800 grid grid-cols-3 gap-4 tabular-nums">
                <div>
                  <div className="font-mono text-lg sm:text-xl font-semibold text-slate-900 dark:text-white">
                    30
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Verified catalog items
                  </div>
                </div>
                <div>
                  <div className="font-mono text-lg sm:text-xl font-semibold text-slate-900 dark:text-white">
                    Buyer DNA
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Taste graph from favourites
                  </div>
                </div>
                <div>
                  <div className="font-mono text-lg sm:text-xl font-semibold text-slate-900 dark:text-white">
                    SSR + RLS
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Supabase relational sync
                  </div>
                </div>
              </div>
            </div>

            <div className="relative min-h-[220px] sm:min-h-[260px] bg-slate-100 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-800">
              <Image
                src={heroShowcaseImg}
                alt="Consumer electronics and hardware directory showcase"
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 58vw"
                className="object-cover"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-6 py-4 text-xs text-white flex flex-wrap items-center justify-between gap-2 tabular-nums">
                <span>10 Departments · 20 Brands · Shill-Ring Graph Detection</span>
                <span className="font-mono text-amber-300">Personalised Catalog Ranking</span>
              </div>
            </div>
          </div>

          {/* Right Column: Upgraded Supabase SSR Authentication Module */}
          <div className="lg:col-span-5 border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800 p-6 sm:p-8 lg:p-10 flex flex-col justify-center">
            <div className="w-full max-w-sm mx-auto space-y-5">
              {/* Segmented Auth Mode Tabs */}
              {mode !== "reset" ? (
                <div
                  role="tablist"
                  aria-label="Authentication method"
                  className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl"
                >
                  {(
                    [
                      { id: "login", label: "Sign In" },
                      { id: "register", label: "Sign Up" },
                      { id: "otp", label: "Email Code" },
                    ] as { id: AuthTab; label: string }[]
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={mode === tab.id}
                      onClick={() => switchMode(tab.id)}
                      className={`py-2 px-2.5 min-h-[40px] text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-amber-500 ${
                        mode === tab.id
                          ? "bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-xs"
                          : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => switchMode("login")}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Sign In</span>
                </button>
              )}

              <div className="space-y-1">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  {mode === "login" && "Welcome back"}
                  {mode === "register" && "Create your buyer account"}
                  {mode === "otp" && "Passwordless email code"}
                  {mode === "reset" && "Reset your password"}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {mode === "login" &&
                    "Enter any username or email with any password to sign in or auto-create your account instantly."}
                  {mode === "register" &&
                    "Sync your relational favourites and unlock automatic Buyer Profile rankings."}
                  {mode === "otp" &&
                    "Receive a one-time 6-digit verification code or magic link by email."}
                  {mode === "reset" &&
                    (supabaseConfigured
                      ? "We will email a secure password recovery link to your inbox."
                      : "Update the password on your local preview account.")}
                </p>
              </div>

              {mode === "login" && (
                <button
                  type="button"
                  onClick={handleQuick1ClickSignIn}
                  disabled={submitting}
                  className="w-full min-h-[44px] py-2.5 px-4 text-xs font-bold text-slate-900 bg-amber-400 hover:bg-amber-500 dark:bg-amber-400 dark:hover:bg-amber-300 rounded-xl inline-flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer disabled:opacity-60 active:scale-[0.99]"
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin text-slate-900" />
                  ) : (
                    <Zap className="w-4 h-4 text-slate-900 fill-slate-900" />
                  )}
                  <span>⚡ 1-Click Demo Sign In</span>
                </button>
              )}

              {/* OAuth Social Buttons (visible on Sign In & Sign Up) */}
              {(mode === "login" || mode === "register") && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      disabled={Boolean(oauthLoading) || submitting}
                      onClick={() => handleOAuthSignIn("google")}
                      className="min-h-[42px] py-2 px-3 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60"
                    >
                      {oauthLoading === "google" ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Globe className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
                      )}
                      <span>Google</span>
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(oauthLoading) || submitting}
                      onClick={() => handleOAuthSignIn("github")}
                      className="min-h-[42px] py-2 px-3 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60"
                    >
                      {oauthLoading === "github" ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <KeyRound className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
                      )}
                      <span>GitHub</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] text-slate-400 dark:text-slate-500">
                    <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                    <span>or continue with credentials</span>
                    <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                  </div>
                </div>
              )}

              {/* Sign In / Sign Up Form */}
              {(mode === "login" || mode === "register") && (
                <form onSubmit={handlePasswordSubmit} className="space-y-3.5" noValidate>
                  {mode === "login" ? (
                    <div className="space-y-1.5">
                      <label
                        htmlFor="rl-auth-identifier"
                        className="block text-xs font-semibold text-slate-700 dark:text-slate-200"
                      >
                        Email or Username
                      </label>
                      <input
                        id="rl-auth-identifier"
                        name="identifier"
                        type="text"
                        autoComplete="username"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        required
                        value={identifier}
                        onChange={(e) => {
                          setIdentifier(e.target.value);
                          if (errorMessage) setErrorMessage(null);
                        }}
                        placeholder="you@example.com or @analyst"
                        className="w-full min-h-[44px] bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-950 focus:border-slate-900 dark:focus:border-amber-400 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none transition-colors"
                      />
                    </div>
                  ) : (
                    <>
                      <div className="space-y-1.5">
                        <label
                          htmlFor="rl-auth-email"
                          className="block text-xs font-semibold text-slate-700 dark:text-slate-200"
                        >
                          Email Address
                        </label>
                        <input
                          id="rl-auth-email"
                          name="email"
                          type="email"
                          autoComplete="email"
                          required
                          value={email}
                          onChange={(e) => {
                            setEmail(e.target.value);
                            if (errorMessage) setErrorMessage(null);
                          }}
                          placeholder="you@example.com"
                          className="w-full min-h-[44px] bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-950 focus:border-slate-900 dark:focus:border-amber-400 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none transition-colors"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label
                          htmlFor="rl-auth-username"
                          className="block text-xs font-semibold text-slate-700 dark:text-slate-200"
                        >
                          Profile Handle
                        </label>
                        <input
                          id="rl-auth-username"
                          name="username"
                          type="text"
                          autoComplete="username"
                          autoCapitalize="none"
                          spellCheck={false}
                          required
                          value={username}
                          onChange={(e) => {
                            setUsername(e.target.value);
                            if (errorMessage) setErrorMessage(null);
                          }}
                          placeholder="e.g. siddhant_01"
                          className="w-full min-h-[44px] bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-950 focus:border-slate-900 dark:focus:border-amber-400 rounded-xl px-3.5 py-2.5 text-sm font-mono text-slate-900 dark:text-white placeholder:font-sans placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none transition-colors"
                        />
                      </div>
                    </>
                  )}

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="rl-auth-password"
                        className="block text-xs font-semibold text-slate-700 dark:text-slate-200"
                      >
                        Password
                      </label>
                      {mode === "login" && (
                        <button
                          type="button"
                          onClick={() => {
                            if (identifier.includes("@")) setEmail(identifier);
                            switchMode("reset");
                          }}
                          className="text-xs font-medium text-amber-700 dark:text-amber-400 hover:underline cursor-pointer"
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        id="rl-auth-password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete={mode === "login" ? "current-password" : "new-password"}
                        required
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (errorMessage) setErrorMessage(null);
                        }}
                        placeholder={mode === "login" ? "Enter your password" : "Minimum 6 characters"}
                        className="w-full min-h-[44px] bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-950 focus:border-slate-900 dark:focus:border-amber-400 rounded-xl pl-3.5 pr-11 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 min-h-[36px] min-w-[36px] inline-flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg cursor-pointer"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {errorMessage && (
                    <div
                      role="alert"
                      className="flex items-start gap-2 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl px-3.5 py-2.5"
                    >
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  {helperNotice && !errorMessage && (
                    <div className="flex items-start gap-2 text-xs text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-xl px-3.5 py-2.5">
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                      <span>{helperNotice}</span>
                    </div>
                  )}

                  <button
                    ref={submitButtonRef}
                    type="submit"
                    disabled={submitting}
                    className="w-full min-h-[44px] py-2.5 px-4 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-60 rounded-xl inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-amber-500"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{mode === "login" ? "Signing in..." : "Creating account..."}</span>
                      </>
                    ) : (
                      <>
                        <span>{mode === "login" ? "Sign In" : "Create Account"}</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* Email OTP / Magic Link Form */}
              {mode === "otp" && (
                <form
                  onSubmit={otpSentTo ? handleVerifyOtp : handleRequestOtp}
                  className="space-y-4"
                  noValidate
                >
                  <div className="space-y-1.5">
                    <label
                      htmlFor="rl-otp-email"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-200"
                    >
                      Email Address
                    </label>
                    <input
                      id="rl-otp-email"
                      type="email"
                      required
                      disabled={Boolean(otpSentTo)}
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      placeholder="you@example.com"
                      className="w-full min-h-[44px] bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 disabled:opacity-70 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-slate-900 dark:focus:border-amber-400 transition-colors"
                    />
                  </div>

                  {otpSentTo && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label
                          htmlFor="rl-otp-code"
                          className="block text-xs font-semibold text-slate-700 dark:text-slate-200"
                        >
                          6-Digit Verification Code
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setOtpSentTo(null);
                            setOtpCode("");
                            setPreviewOtpCode(null);
                            setHelperNotice(null);
                          }}
                          className="text-xs font-medium text-amber-700 dark:text-amber-400 hover:underline cursor-pointer"
                        >
                          Change email
                        </button>
                      </div>
                      <input
                        id="rl-otp-code"
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        required
                        value={otpCode}
                        onChange={(e) => {
                          setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                          if (errorMessage) setErrorMessage(null);
                        }}
                        placeholder="000000"
                        className="w-full min-h-[44px] bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-base font-mono tracking-widest text-center text-slate-900 dark:text-white focus:outline-none focus:border-slate-900 dark:focus:border-amber-400 tabular-nums"
                      />
                      {previewOtpCode && (
                        <div className="flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg px-3 py-2 tabular-nums">
                          <span>
                            Preview code: <strong className="font-mono">{previewOtpCode}</strong>
                          </span>
                          <button
                            type="button"
                            onClick={() => setOtpCode(previewOtpCode)}
                            className="font-semibold text-amber-700 dark:text-amber-400 hover:underline cursor-pointer whitespace-nowrap"
                          >
                            Use Code
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {errorMessage && (
                    <div
                      role="alert"
                      className="flex items-start gap-2 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl px-3.5 py-2.5"
                    >
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  {helperNotice && !errorMessage && (
                    <p className="text-xs text-slate-600 dark:text-slate-300">{helperNotice}</p>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full min-h-[44px] py-2.5 px-4 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-60 rounded-xl inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{otpSentTo ? "Verifying code..." : "Sending code..."}</span>
                      </>
                    ) : (
                      <>
                        <Mail className="w-4 h-4" />
                        <span>{otpSentTo ? "Verify & Sign In" : "Send Sign-In Code"}</span>
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* Password Recovery Form */}
              {mode === "reset" && (
                <form onSubmit={handleResetPassword} className="space-y-4" noValidate>
                  <div className="space-y-1.5">
                    <label
                      htmlFor="rl-reset-email"
                      className="block text-xs font-semibold text-slate-700 dark:text-slate-200"
                    >
                      {supabaseConfigured ? "Account Email Address" : "Email or @username"}
                    </label>
                    <input
                      id="rl-reset-email"
                      type="text"
                      required
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      placeholder={supabaseConfigured ? "you@example.com" : "you@example.com or @username"}
                      className="w-full min-h-[44px] bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-slate-900 dark:focus:border-amber-400"
                    />
                  </div>

                  {!supabaseConfigured && (
                    <div className="space-y-1.5">
                      <label
                        htmlFor="rl-reset-new-password"
                        className="block text-xs font-semibold text-slate-700 dark:text-slate-200"
                      >
                        New Password
                      </label>
                      <input
                        id="rl-reset-new-password"
                        type="password"
                        required
                        value={resetNewPassword}
                        onChange={(e) => setResetNewPassword(e.target.value)}
                        placeholder="Minimum 6 characters"
                        className="w-full min-h-[44px] bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-slate-900 dark:focus:border-amber-400"
                      />
                    </div>
                  )}

                  {errorMessage && (
                    <div
                      role="alert"
                      className="flex items-start gap-2 text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-xl px-3.5 py-2.5"
                    >
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full min-h-[44px] py-2.5 px-4 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 disabled:opacity-60 rounded-xl inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Processing...</span>
                      </>
                    ) : (
                      <span>
                        {supabaseConfigured ? "Send Recovery Link" : "Update Preview Password"}
                      </span>
                    )}
                  </button>
                </form>
              )}

              {/* Pre-Seeded Analyst Evaluation Quick Fill */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                <button
                  type="button"
                  onClick={handleFillDemoCredentials}
                  className="w-full min-h-[42px] py-2 px-4 text-xs font-semibold text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-amber-500"
                >
                  <KeyRound className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>Fill Demo Workspace (@analyst)</span>
                </button>

                {!supabaseConfigured && (
                  <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                    Connect your Supabase project anytime by setting{" "}
                    <span className="font-mono text-slate-700 dark:text-slate-300">
                      NEXT_PUBLIC_SUPABASE_URL
                    </span>{" "}
                    and{" "}
                    <span className="font-mono text-slate-700 dark:text-slate-300">
                      NEXT_PUBLIC_SUPABASE_ANON_KEY
                    </span>{" "}
                    in Secrets and running{" "}
                    <span className="font-mono text-slate-700 dark:text-slate-300">
                      supabase/0003_auth_profiles_favorites.sql
                    </span>
                    .
                  </p>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
