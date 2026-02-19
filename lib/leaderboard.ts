import { kv } from "@vercel/kv";

export interface PlayerData {
  id: string;
  name: string;
  image: string;
  credits: number;
}

export async function getLeaderboard(): Promise<PlayerData[]> {
  try {
    // 1. Get all player IDs
    const playerIds = await kv.smembers("all_players");
    if (!playerIds || playerIds.length === 0) return [];

    // 2. Prepare keys
    const creditKeys = playerIds.map((id) => `user:credits:${id}`);
    const profileKeys = playerIds.map((id) => `user:profile:${id}`);

    // 3. Fetch all data in parallel (2 requests total)
    const [creditsRaw, profilesRaw] = await Promise.all([
      kv.mget<number[]>(...creditKeys),
      kv.mget<any[]>(...profileKeys),
    ]);

    // 4. Combine and format
    const leaderboard = playerIds.map((id, index) => {
      const profile = profilesRaw[index] || {};
      return {
        id,
        credits: creditsRaw[index] ?? 5000, // Default to 5000 if not set
        name: profile.name ?? `Joueur ${id.slice(-4)}`, // Fallback name
        image: profile.image ?? null, // Fallback handled in UI
      };
    });

    // 5. Sort by credits (High -> Low) and keep Top 4
    return leaderboard
      .sort((a, b) => b.credits - a.credits)
      .slice(0, 5);

  } catch (error) {
    console.error("Leaderboard error:", error);
    return [];
  }
}