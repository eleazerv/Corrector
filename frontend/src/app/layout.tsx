import type { Metadata } from "next";
import { Source_Code_Pro, Source_Sans_3, Source_Serif_4 } from "next/font/google";
import { DataProvider } from "@/lib/store";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

const serif = Source_Serif_4({ variable: "--font-source-serif", subsets: ["latin"], weight: ["600"] });
const sans = Source_Sans_3({ variable: "--font-source-sans", subsets: ["latin"], weight: ["400", "600", "700"] });
const mono = Source_Code_Pro({ variable: "--font-source-code", subsets: ["latin"], weight: ["400"] });

export const metadata: Metadata = {
  title: "Corrector: Penilaian Ujian",
  description: "Penilaian jawaban ujian dengan saran AI yang direview dan diputuskan oleh dosen.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body className="antialiased">
        <DataProvider>
          <ToastProvider>{children}</ToastProvider>
        </DataProvider>
      </body>
    </html>
  );
}
