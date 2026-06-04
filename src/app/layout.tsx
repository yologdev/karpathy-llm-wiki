import type { Metadata } from "next";
import { Inter, Source_Serif_4, JetBrains_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { NavHeader } from "@/components/NavHeader";
import { Footer } from "@/components/Footer";
import { ClientProviders } from "@/components/ClientProviders";
import { EnsureYoyo } from "@/components/EnsureYoyo";
import "./globals.css";

// Self-hosted via next/font (no runtime Google CDN calls). Exposed as CSS
// variables consumed by the `--font-*` tokens in globals.css.
const fontSans = Inter({
  subsets: ["latin"],
  variable: "--font-sans-next",
  display: "swap",
});
const fontSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-serif-next",
  display: "swap",
});
const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-next",
  display: "swap",
});

export const metadata: Metadata = {
  title: "yopedia",
  description:
    "A shared second brain for humans and agents — ingest sources, query your wiki, and browse interlinked pages.",
};

const themeScript = `
(function() {
  try {
    var t = localStorage.getItem('theme');
    if (t === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (t === 'light') {
      document.documentElement.classList.add('light');
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.classList.add('dark');
    }
  } catch(e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fontSans.variable} ${fontSerif.variable} ${fontMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen antialiased flex flex-col">
        <ClerkProvider>
          <ClientProviders>
            <EnsureYoyo />
            <a href="#main-content" className="skip-nav">
              Skip to main content
            </a>
            <NavHeader />
            <main id="main-content" className="flex-1">
              {children}
            </main>
            <Footer />
          </ClientProviders>
        </ClerkProvider>
      </body>
    </html>
  );
}
