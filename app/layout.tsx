import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Providers from "@/components/Providers";
import ActiveBetsOverlay from "@/components/ActiveBetsOverlay";
import AnimalOfTheDay from "@/components/AnimalOfTheDay";

// Configuration de la police locale
const squidwod = localFont({
  src: "../public/fonts/Squidwod.otf",
  variable: "--font-squidwod",
});

export const metadata: Metadata = {
  title: "SquidHub",
  description: "Le portail officiel du Serveur de l'Apocalypse",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className={`${squidwod.variable} antialiased`}>
        <Providers>
          <Navbar />
          {children}
          <AnimalOfTheDay />
          <ActiveBetsOverlay />
        </Providers>
      </body>
    </html>
  );
}