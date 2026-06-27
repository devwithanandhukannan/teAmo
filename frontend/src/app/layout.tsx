import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SocketProvider } from "@/context/SocketContext";
import { ToastProvider } from "@/components/Toast";
import { Navigation } from "@/components/Navigation";
import { Dock } from "@/components/Dock";
import { ProfileDrawer } from "@/components/ProfileDrawer";

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
    <html lang="en" className="h-full">
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-full flex flex-col bg-[#000000] text-gray-100 antialiased`}>
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
      </body>
    </html>
  );
}
