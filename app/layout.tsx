import type { Metadata } from "next";
import "./globals.css";
import "./college-theme.css";
import "./dark-theme.css";
import "./classroom.css";
import "./course-file-preview.css";
import "./subject-cards.css";
import { themeStorageKey } from "./lib/theme";

export const metadata: Metadata = {
  title: "Електронний журнал | ІТ коледж Львівської політехніки",
  description: "Дипломний проєкт електронного журналу ІТ коледжу Львівської політехніки: оцінки, відвідування, теми занять та навчальні групи.",
  icons: {
    icon: "/brand/itcollege-logo.jpg",
    shortcut: "/brand/itcollege-logo.jpg",
    apple: "/brand/itcollege-logo.jpg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uk" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{
          __html: `try {
            if (localStorage.getItem(${JSON.stringify(themeStorageKey)}) === "dark") {
              document.documentElement.dataset.theme = "dark";
            }
          } catch {}
          `,
        }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
