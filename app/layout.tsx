import "./globals.css";

export const metadata = {
  title: "Clan Codex",
  description: "Codex colaborativo, inventário e trocas do clã",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
