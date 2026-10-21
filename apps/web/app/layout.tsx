import type { Metadata } from "next";
import { Geist, Geist_Mono, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-serif",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://casewise.si"),
  title: {
    default: "Casewise: Verified Legal Research for New York Attorneys",
    template: "%s · Casewise",
  },
  description:
    "AI legal research for New York landlord-tenant and real estate litigation attorneys. Every answer cited to NY statutes, court decisions, and DHCR guidance, with citations and quotations verified against the source.",
  keywords: [
    "New York legal research",
    "landlord tenant attorney NY",
    "citation checker",
    "legal AI for attorneys",
    "NY housing court",
    "real estate litigation research",
  ],
  openGraph: {
    type: "website",
    siteName: "Casewise",
    url: "https://casewise.si",
    title: "Casewise: Verified Legal Research for New York Attorneys",
    description:
      "Every answer cited to NY statutes, decisions, and DHCR guidance. Citations verified against 5.1 million official records.",
    images: [{ url: "/brand/og.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Casewise: Verified Legal Research for New York Attorneys",
    images: ["/brand/og.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${sourceSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
