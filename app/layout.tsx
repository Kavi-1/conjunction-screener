import type { Metadata } from "next";
import type { ReactNode } from "react";
import { IBM_Plex_Mono, Spectral } from "next/font/google";

import "./globals.css";
import "./details.css";
import "./approaches.css";
import "./replay.css";

// Spectral carries every word on the page. Plex Mono is reserved for measured
// quantities, so anything set in monospace is a number with a unit behind it.
const prose = Spectral({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-prose",
  display: "swap",
});

const measure = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-measure",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Conjunction Screener",
  description:
    "Track satellites, find overhead passes, and check close approaches using public orbital data.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${prose.variable} ${measure.variable}`}>
      <body>{children}</body>
    </html>
  );
}
