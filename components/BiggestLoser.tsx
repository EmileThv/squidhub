import Image from "next/image";
import { Pirata_One } from "next/font/google";
import { MTG_DISPLAY_NAMES, computeStandings } from "@/lib/mtg";
import { getMtgGames, getMtgPlayers } from "@/lib/mtg-server";

const pirata = Pirata_One({ weight: "400", subsets: ["latin"] });

// Paper grain for the old wanted-poster look
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

// Discord avatars default to 128px, ask for a big one
const largeAvatar = (url: string) => `${url.split("?")[0]}?size=1024`;

// Tonight's biggest loser: whoever is last in the Commander standings
export default async function BiggestLoser() {
  const [players, games] = await Promise.all([getMtgPlayers(), getMtgGames()]);
  const loser = computeStandings(players, games).at(-1);
  const name = loser ? MTG_DISPLAY_NAMES[players.findIndex((p) => p.id === loser.id)] ?? loser.name : null;

  return (
    <div className="relative h-full w-full bg-[#2a1a0c]">
      {loser?.image && (
        <Image
          src={largeAvatar(loser.image)}
          alt={name ?? "Tonight's biggest loser"}
          fill
          priority
          sizes="(min-width: 768px) 38rem, 100vw"
          className="object-cover"
          style={{ filter: "sepia(0.7) saturate(0.85) contrast(1.1) brightness(0.92)" }}
        />
      )}

      {/* Aged paper: grain, then edges burnt dark brown */}
      <div className="absolute inset-0 mix-blend-multiply opacity-40" style={{ backgroundImage: GRAIN }} />
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse at 50% 40%, transparent 40%, rgba(42, 22, 6, 0.55) 75%, rgba(20, 10, 2, 0.95) 100%)" }}
      />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#1a0e04] to-transparent" />

      <h3
        className={`${pirata.className} absolute bottom-5 inset-x-6 text-center leading-[0.8] text-[#f1e2c2]`}
        style={{ textShadow: "0 2px 0 #1a0e04, 0 0 18px rgba(0, 0, 0, 0.6)" }}
      >
        <span className="block text-2xl md:text-3xl">
          Tonight&apos;s biggest <span className="text-[#c0392b]">loser</span>
        </span>
        {name && <span className="block mt-2 text-7xl md:text-8xl">{name}</span>}
      </h3>
    </div>
  );
}
