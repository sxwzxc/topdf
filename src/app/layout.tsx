import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Img → PDF",
  description: "Convert and merge images into a single PDF directly in the browser. Supports crop, rotate, reorder, and merge multiple images.",
  icons: {
    icon: "/app-icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-US">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
