import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "LoadBond | Security exposure workbench",
  description: "Trace obligations. Review evidence. Compute exposure.",
};
export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
