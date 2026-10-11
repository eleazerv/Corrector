import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Roboto_Mono } from "next/font/google";
import { AuthProvider } from "@/lib/auth";
import { ToastProvider } from "@/components/kit/toast";
import "./globals.css";

const sans = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] });
const mono = Roboto_Mono({ variable: "--font-roboto-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Corrector",
  description: "Penilaian jawaban ujian: AI memberi saran, dosen memutuskan.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={`${sans.variable} ${mono.variable}`}>
      <body className="antialiased">
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
