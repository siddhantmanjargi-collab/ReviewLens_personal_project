"use client";

import React from "react";
import { Moon, Sun } from "lucide-react";

export type ActiveSection = "catalog" | "compare" | "benchmarks" | "tester" | "shortlist";

interface HeaderProps {
  activeSection: ActiveSection;
  setActiveSection: (s: ActiveSection) => void;
  compareCount: number;
  shortlistCount: number;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onOpenImport: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeSection,
  setActiveSection,
  compareCount,
  shortlistCount,
  isDarkMode,
  onToggleDarkMode,
  onOpenImport,
}) => {
  const navItems: { id: ActiveSection; label: string }[] = [
    { id: "catalog", label: "Catalog" },
    { id: "compare", label: compareCount > 0 ? `Compare (${compareCount})` : "Compare" },
    { id: "benchmarks", label: "Benchmarks" },
    { id: "tester", label: "Review Lab" },
    { id: "shortlist", label: shortlistCount > 0 ? `Shortlist (${shortlistCount})` : "Shortlist" },
  ];

  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-950/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 transition-colors duration-150">
      <div className="max-w-[1360px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => setActiveSection("catalog")}
          className="text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-amber-500"
        >
          ReviewLens
        </button>

        {/* Zone 2: 5 concise single-line text links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300 tabular-nums">
          {navItems.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveSection(item.id)}
                className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
                  isActive
                    ? "border-slate-900 dark:border-amber-400 text-slate-900 dark:text-white font-semibold"
                    : "border-transparent hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-slate-700"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Theme Toggle + Primary Action */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onToggleDarkMode}
            aria-label={isDarkMode ? "Switch to light theme" : "Switch to dark theme"}
            title={isDarkMode ? "Switch to light theme" : "Switch to dark theme"}
            className="px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-100 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-amber-500"
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

          <button
            type="button"
            onClick={onOpenImport}
            className="px-4 py-2 text-xs font-semibold text-white dark:text-slate-950 bg-slate-900 dark:bg-amber-400 hover:bg-slate-800 dark:hover:bg-amber-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-amber-500"
          >
            Add Product Link
          </button>
        </div>
      </div>
    </header>
  );
};
