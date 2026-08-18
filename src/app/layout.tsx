import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { AuthProvider } from "../context/AuthContext";
import UserMenu from "../components/UserMenu";
import ThemeControl from "../components/ThemeControl";
import { ThemeProvider } from "../context/ThemeContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "notestream",
  description: "You are here.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var p=localStorage.getItem('notestream_theme');var v=['system','dark','light','apple','orange','lemon','lime','blueberry','grape'];if(v.indexOf(p)<0)p='system';var t=p==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):p;document.documentElement.dataset.theme=t;document.documentElement.dataset.themePreference=p;document.documentElement.style.colorScheme=t==='light'?'light':'dark'}catch(e){document.documentElement.dataset.theme='dark'}})();` }} />
      </head>
      <body className="min-h-full flex flex-col bg-neutral-950 text-neutral-200">
        <ThemeProvider>
          <AuthProvider>
          <header className="sticky top-0 z-40 w-full border-b border-neutral-800 bg-neutral-950/80 backdrop-blur-md">
            <div className="flex h-16 items-center justify-between px-6">
              <div className="flex items-center gap-8">
                <Link
                  href="/"
                  className="text-lg font-black tracking-[0.2em] text-neutral-100 hover:text-indigo-400 transition-colors uppercase"
                >
                  notestream
                </Link>
                <nav className="flex items-center gap-6">
                  <Link
                    href="/"
                    className="text-sm font-medium text-neutral-400 hover:text-neutral-100 transition-colors tracking-wide"
                  >
                    Home
                  </Link>
                  <Link
                    href="/sandbox"
                    className="text-sm font-medium text-neutral-400 hover:text-neutral-100 transition-colors tracking-wide"
                  >
                    Sandbox
                  </Link>
                  <Link
                    href="/practice"
                    className="text-sm font-medium text-neutral-400 hover:text-neutral-100 transition-colors tracking-wide"
                  >
                    Practice
                  </Link>
                <Link
                  href="/upload"
                  className="text-sm font-medium text-neutral-400 hover:text-neutral-100 transition-colors tracking-wide"
                >
                  Upload
                </Link>
                </nav>
              </div>
              <div className="flex items-center gap-4">
                <ThemeControl />
                <UserMenu />
              </div>
            </div>
          </header>
          <div className="flex-1 flex flex-col min-h-0">
            {children}
          </div>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
