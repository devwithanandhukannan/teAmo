import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SocketProvider } from "@/context/SocketContext";
import { ToastProvider } from "@/components/Toast";
import { Navigation } from "@/components/Navigation";
import { Dock } from "@/components/Dock";
import { ProfileDrawer } from "@/components/ProfileDrawer";
import { ThemeProvider } from "@/context/ThemeContext";
import { ModalProvider } from "@/context/ModalContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Hangout powered by kneazllle",
  description: "Dating, anonymous matching, snaps stories and scanner radar lounge.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  const savedTheme = localStorage.getItem('theme') || 'system';
                  const root = document.documentElement;
                  if (savedTheme === 'dark') {
                    root.classList.add('dark-theme');
                    root.classList.remove('light-theme');
                  } else if (savedTheme === 'light') {
                    root.classList.add('light-theme');
                    root.classList.remove('dark-theme');
                  } else {
                    root.classList.remove('dark-theme', 'light-theme');
                  }
                } catch (e) {
                  console.error(e);
                }
              })();
            `
          }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-full flex flex-col antialiased`}>
        <ThemeProvider>
          <ModalProvider>
            <SocketProvider>
              <ToastProvider>
                <Navigation />
                <main className="flex flex-col flex-1">
                  {children}
                </main>
                <Dock />
                <ProfileDrawer />
              </ToastProvider>
            </SocketProvider>
          </ModalProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
