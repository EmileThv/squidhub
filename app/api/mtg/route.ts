import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { auth } from "@/auth";
import { computeStandings, type MtgGame, type MtgPlayer } from "@/lib/mtg";

export const dynamic = "force-dynamic";

// Hash of gameId -> MtgGame
const GAMES_KEY = "mtg:games";

// Comma-separated Discord ids of the players allowed to enter games
function getMtgPlayerIds(): string[] {
  return (process.env.MTG_PLAYER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

async function getMtgPlayers(): Promise<MtgPlayer[]> {
  const ids = getMtgPlayerIds();
  if (ids.length === 0) return [];

  const profiles = await kv.mget<(Partial<MtgPlayer> | null)[]>(...ids.map((id) => `user:profile:${id}`));
  return ids.map((id, index) => ({
    id,
    name: profiles[index]?.name ?? `Joueur ${id.slice(-4)}`,
    image: profiles[index]?.image ?? null,
  }));
}

async function getMtgGames(): Promise<MtgGame[]> {
  const raw = await kv.hgetall<Record<string, MtgGame>>(GAMES_KEY);
  if (!raw) return [];

  // Most recent first
  return Object.values(raw).sort(
    (a, b) => b.playedAt.localeCompare(a.playedAt) || b.createdAt - a.createdAt
  );
}

// Returns the session user's id if they are one of the MTG players
async function getMtgEditor(): Promise<string | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId || !getMtgPlayerIds().includes(userId)) return null;
  return userId;
}

export async function GET() {
  const [players, games, editorId] = await Promise.all([
    getMtgPlayers(),
    getMtgGames(),
    getMtgEditor(),
  ]);

  return NextResponse.json({
    players,
    games,
    standings: computeStandings(players, games),
    canEdit: !!editorId,
  });
}

export async function POST(req: Request) {
  const editorId = await getMtgEditor();
  if (!editorId) return new Response("Forbidden", { status: 403 });

  let body: { placements?: unknown; playedAt?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "BAD_JSON" }, { status: 400 });
  }

  const { placements } = body;
  const playerIds = getMtgPlayerIds();

  if (
    !Array.isArray(placements) ||
    placements.length < 3 ||
    placements.length > 4 ||
    new Set(placements).size !== placements.length ||
    !placements.every((id) => typeof id === "string" && playerIds.includes(id))
  ) {
    return NextResponse.json({ error: "INVALID_PLACEMENTS" }, { status: 400 });
  }

  const today = new Date().toISOString().split("T")[0];
  const playedAt =
    typeof body.playedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.playedAt)
      ? body.playedAt
      : today;

  const game: MtgGame = {
    id: crypto.randomUUID(),
    playedAt,
    placements,
    enteredBy: editorId,
    createdAt: Date.now(),
  };

  await kv.hset(GAMES_KEY, { [game.id]: game });
  return NextResponse.json(game);
}

export async function DELETE(req: Request) {
  const editorId = await getMtgEditor();
  if (!editorId) return new Response("Forbidden", { status: 403 });

  const gameId = new URL(req.url).searchParams.get("id");
  if (!gameId) return NextResponse.json({ error: "MISSING_ID" }, { status: 400 });

  const deleted = await kv.hdel(GAMES_KEY, gameId);
  if (!deleted) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  return NextResponse.json({ success: true });
}
