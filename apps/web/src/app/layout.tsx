import { DISCLAIMER } from "@aiview/shared";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI View",
  description:
    "Checks UK property listing photos for signs of AI editing, so you know what to look at when you view.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB">
      <body>
        <main>
          {children}
          <footer className="muted">
            <p>{DISCLAIMER}</p>
            <p>
              <Link href="/">AI View</Link> · <Link href="/agents">For estate agents</Link>
            </p>
          </footer>
        </main>
      </body>
    </html>
  );
}
