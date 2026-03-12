import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { VisualEditsMessenger } from "orchids-visual-edits";
import { AuthProvider } from "@/lib/auth-context";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/ThemeProvider";
import { MobileRestriction } from "@/components/MobileRestriction";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RMS",
  description: "Automated Gadget Sheet & Grade Card generation for colleges",
  manifest: "/manifest.json?v=1",
  icons: {
    icon: "/Logo.png?v=1",
    shortcut: "/Logo.png?v=1",
    apple: "/Logo.png?v=1",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
        <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
          <ThemeProvider
            attribute="class"
            defaultTheme="light"
            enableSystem
            disableTransitionOnChange
          >
            <AuthProvider>
              <MobileRestriction>
                {children}
              </MobileRestriction>
              <Toaster position="top-right" richColors />
            </AuthProvider>
            <VisualEditsMessenger />
          </ThemeProvider>
        </body>

    </html>
  );
}
