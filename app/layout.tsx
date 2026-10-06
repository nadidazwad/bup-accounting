import type { Metadata, Viewport } from "next";
import { Pixelify_Sans, Press_Start_2P } from "next/font/google";
import "./globals.css";

const display = Press_Start_2P({ weight: "400", subsets: ["latin"], variable: "--font-display", display: "swap" });
const body = Pixelify_Sans({ subsets: ["latin"], variable: "--font-body", display: "swap" });

export const metadata: Metadata = {
  title: "BUP ACCOUNTING | Grand Theft Pokémon",
  description: "An adventure in creative accounting. Play your way to BUPAF, or skip straight to registration.",
};

export const viewport: Viewport = { themeColor: "#120f24", viewportFit: "cover" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
