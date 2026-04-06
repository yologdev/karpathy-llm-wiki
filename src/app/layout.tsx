import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LLM Wiki",
  description:
    "Build a personal knowledge base using LLMs — ingest sources, query your wiki, and browse interlinked pages.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
