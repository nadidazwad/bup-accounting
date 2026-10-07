import type { Metadata, Viewport } from "next";
import { Geist, Jersey_10, Press_Start_2P, Silkscreen } from "next/font/google";
import "./globals.css";

const display = Press_Start_2P({ weight: "400", subsets: ["latin"], variable: "--font-display", display: "swap" });
const body = Geist({ subsets: ["latin"], variable: "--font-body", display: "swap" });
// Level 2: real pixel faces, rendered on the 640×480 grid (the canvas reads these variables).
const gta = Jersey_10({ weight: "400", subsets: ["latin"], variable: "--font-gta", display: "swap" });
const gtaSmall = Silkscreen({ weight: ["400", "700"], subsets: ["latin"], variable: "--font-gta-small", display: "swap" });

export const metadata: Metadata = {
  title: "Grand Theft Pokémon",
  description: "A Pokémon adventure. Probably.",
};

export const viewport: Viewport = { themeColor: "#0c0c10", viewportFit: "cover" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${gta.variable} ${gtaSmall.variable}`}>
      <body>{children}</body>
    </html>
  );
}
