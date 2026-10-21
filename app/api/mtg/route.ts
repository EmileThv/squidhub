import { NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { auth } from "@/auth";
import { computeStandings, type MtgGame } from "@/lib/mtg";
import { MTG_GAMES_KEY, getMtgGames, getMtgPlayerIds, getMtgPlayers } from "@/lib/mtg-server";

export const dynamic = "force-dynamic";

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

  await kv.hset(MTG_GAMES_KEY, { [game.id]: game });
  return NextResponse.json(game);
}

export async function DELETE(req: Request) {
  const editorId = await getMtgEditor();
  if (!editorId) return new Response("Forbidden", { status: 403 });

  const gameId = new URL(req.url).searchParams.get("id");
  if (!gameId) return NextResponse.json({ error: "MISSING_ID" }, { status: 400 });

  const deleted = await kv.hdel(MTG_GAMES_KEY, gameId);
  if (!deleted) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  return NextResponse.json({ success: true });
}
