import type { Metadata, Viewport } from "next";
import { nunito } from "@/fonts";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Pedi Clinic",
    template: "%s · Pedi Clinic",
  },
  description:
    "Check in, follow the live queue, and manage appointments for your child's pediatric clinic visits.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Pedi Clinic",
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
    <html lang="en" className={`${nunito.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-surface-sunken text-foreground">
        {/* Phone-first: the app stays a phone-width column, centred on larger screens. */}
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col bg-surface shadow-sm">
          <ToastProvider>{children}</ToastProvider>
        </div>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
