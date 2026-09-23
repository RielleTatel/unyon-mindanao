import type { Metadata } from "next";
import type { ReactNode } from "react";

import { portalMessages } from "@/shared/i18n/en";

import "./globals.css";

export const metadata: Metadata = {
  title: portalMessages.metadata.title,
  description: portalMessages.metadata.description,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html className="scroll-smooth motion-reduce:scroll-auto" data-scroll-behavior="smooth" lang="en">
      <body className="m-0 bg-background font-sans text-foreground [text-rendering:optimizeLegibility]">
        {children}
      </body>
    </html>
  );
}
