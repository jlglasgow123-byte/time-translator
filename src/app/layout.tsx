import type { Metadata } from "next";
import { Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { Nav } from "@/components/ui/Nav";
import { Footer } from "@/components/ui/Footer";
import { InactivityTimer } from "@/components/auth/InactivityTimer";
import { JsdWidget } from "@/components/ui/JsdWidget";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Time Translator",
  description: "Translate calendar time into invoices, timesheets, graphs, and decisions",
  openGraph: {
    images: [{ url: "/brand/TT Logo.png" }],
  },
  verification: {
    google: "6-lMtmDcbnZC8w8YGZJ3C2zDoAmrc1FLaNRn7iIvqKA",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${plusJakarta.variable} ${geistMono.variable} antialiased`}
      >
        <Nav />
        <InactivityTimer />
        {children}
        <Footer />
        <Analytics />
        <JsdWidget />
      </body>
    </html>
  );
}
