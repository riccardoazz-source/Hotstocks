import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hotstocks — Find the next breakout",
  description:
    "A quantitative screener that ranks high-potential stocks and explains why — and roughly when they could re-rate.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
