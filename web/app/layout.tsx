import type { Metadata } from "next";
import { Nunito, Geist_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { ClerkProvider } from "@clerk/nextjs";

const nunito = Nunito({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CounterPro — AI Real Estate Negotiation Coach",
  description: "Get a personalized counter-offer strategy and ready-to-send scripts for your real estate deal. No agent needed.",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "32x32", type: "image/x-icon" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider appearance={{
      elements: {
        footer: "hidden",
        badge: "hidden",
        formButtonPrimary: "bg-primary hover:bg-primary/90 text-primary-foreground",
        card: "bg-card border-border",
        headerTitle: "text-foreground",
        headerSubtitle: "text-muted-foreground",
        socialButtonsBlockButton: "bg-background border-border hover:bg-muted text-foreground",
        formFieldInput: "bg-background border-border text-foreground",
        footerActionLink: "text-primary hover:text-primary/90",
      },
    }}>
      <html lang="en" className={cn("h-full antialiased", nunito.variable, geistMono.variable)}>
        <body className="min-h-full flex flex-col bg-background text-foreground">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
