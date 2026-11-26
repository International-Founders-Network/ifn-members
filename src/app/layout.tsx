import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import { isClerkAdmin } from "@/lib/auth-helpers";
import "./globals.css";

export const dynamic = "force-dynamic";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "IFN Members",
  description: "International Founders Network member home, library, and account.",
  // Icons come ONLY from the App Router file convention:
  //   src/app/favicon.ico, src/app/icon.png, src/app/apple-icon.png
  // Declaring metadata.icons as well produced dual <link rel="icon"> tags
  // (hashed file-convention URL + bare /favicon.ico), which raced in some
  // browsers and contributed to globe ↔ period-mark flicker after the swap.
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const admin = await isClerkAdmin();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[var(--paper)] text-[var(--ink)]">
        <ClerkProvider>
          <SiteHeader isAdmin={admin} />
          <main className="mx-auto w-full max-w-[75rem] flex-1 px-4 py-8">{children}</main>
          <footer className="border-t border-[var(--ink-muted)]/15 py-6 text-center text-xs text-[var(--ink-muted)]">
            International Founders Network ·{" "}
            <a href="https://ifn.community" className="hover:text-[var(--crimson)]">
              ifn.community
            </a>
          </footer>
        </ClerkProvider>
      </body>
    </html>
  );
}
