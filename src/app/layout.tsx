import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Img → PDF",
  description: "Convert and merge images into a single PDF directly in the browser. Supports crop, rotate, reorder, and merge multiple images.",
  icons: {
    icon: "/app-icon.svg",
  },
  // Prevent browser auto-translation from mutating DOM text nodes before
  // React hydration, which causes React error #418 (hydration mismatch).
  other: { "google": "notranslate" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-US" suppressHydrationWarning>
      <head>
        <meta name="google" content="notranslate" />
      </head>
      <body className="antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
