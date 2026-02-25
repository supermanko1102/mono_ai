import type { Metadata } from "next";
import { AgentChatWidget } from "@/components/agent-chat-widget";
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
        {children}
        <AgentChatWidget />
      </body>
    </html>
  );
}
