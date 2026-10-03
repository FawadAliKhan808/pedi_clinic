import type { Metadata, Viewport } from "next";
import { brand, brandColorVariables } from "@/brand";
import { jakarta, nunito } from "@/fonts";
import { AppInstalledOverlay } from "@/components/app-installed-overlay";
import { OfflineBanner } from "@/components/offline-banner";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { ToastProvider } from "@/components/ui/toast";
import { appleStartupImages } from "@/lib/pwa/splash";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: brand.name,
    template: `%s · ${brand.name}`,
  },
  description: brand.description,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: brand.shortName,
    // iPhone/iPad launch screen (Android builds its own from the manifest).
    startupImage: appleStartupImages("parent"),
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1917" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${nunito.variable} ${jakarta.variable} h-full antialiased`}
      // The white-label brand's colour overrides, if it has any.
      style={brandColorVariables()}
    >
      <body className="min-h-full flex flex-col bg-surface-sunken text-foreground">
        {/* Each screen sets its own width: phone-first, widening on tablets and laptops. */}
        <ToastProvider>{children}</ToastProvider>
        <OfflineBanner />
        <AppInstalledOverlay />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
