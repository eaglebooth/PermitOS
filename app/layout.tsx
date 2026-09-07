import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PermitOS | Evidence readiness gate",
  description: "A bounded permit-evidence readiness workflow on GenLayer.",
  icons: { icon: "/permitos-logo.png", apple: "/permitos-logo.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
