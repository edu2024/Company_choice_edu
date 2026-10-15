import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HealthCore | Atención sin fronteras",
  description: "Red de atención ambulatoria en Estados Unidos y Reino Unido.",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}