import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { TRPCProvider } from "@/lib/trpc";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AgentOps - AI Observability Platform",
  description: "AI-native observability for agent applications",
};

// When deploying with Clerk, wrap with ClerkProvider:
// import { ClerkProvider } from "@clerk/nextjs";
// and wrap the html element with <ClerkProvider>

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
}
