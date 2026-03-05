import type { Metadata } from "next";
import { AgentChatWidget } from "@/components/agent-chat-widget";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "MYASSETS Dashboard",
  description: "MYASSETS with AI agent navigation and modal actions",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <Providers>
          {children}
          <AgentChatWidget />
        </Providers>
      </body>
    </html>
  );
}
