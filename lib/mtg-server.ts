import { kv } from "@vercel/kv";
import type { MtgGame, MtgPlayer } from "@/lib/mtg";

// Server-only MTG data access, shared by /api/mtg and the homepage

// Hash of gameId -> MtgGame
export const MTG_GAMES_KEY = "mtg:games";

// Comma-separated Discord ids of the players allowed to enter games
export function getMtgPlayerIds(): string[] {
  return (process.env.MTG_PLAYER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export async function getMtgPlayers(): Promise<MtgPlayer[]> {
  const ids = getMtgPlayerIds();
  if (ids.length === 0) return [];

  const profiles = await kv.mget<(Partial<MtgPlayer> | null)[]>(...ids.map((id) => `user:profile:${id}`));
  return ids.map((id, index) => ({
    id,
    name: profiles[index]?.name ?? `Joueur ${id.slice(-4)}`,
    image: profiles[index]?.image ?? null,
  }));
}

export async function getMtgGames(): Promise<MtgGame[]> {
  const raw = await kv.hgetall<Record<string, MtgGame>>(MTG_GAMES_KEY);
  if (!raw) return [];

  // Most recent first
  return Object.values(raw).sort(
    (a, b) => b.playedAt.localeCompare(a.playedAt) || b.createdAt - a.createdAt
  );
}
