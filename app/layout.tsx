import "./globals.css";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

export const metadata = {
  title: "ReviewLens",
  description: "Amazon India product & review acquisition, verification, and Gemini-powered review analysis.",
  openGraph: {
    title: "ReviewLens",
    description: "Amazon India product & review acquisition, verification, and Gemini-powered review analysis.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${mono.variable}`}>
      <body className="bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-50 antialiased min-h-screen font-sans selection:bg-amber-200 selection:text-slate-900 dark:selection:bg-amber-400 dark:selection:text-slate-950 transition-colors duration-150">
        {children}
      </body>
    </html>
  );
}
