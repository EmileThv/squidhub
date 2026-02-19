import { kv } from "@vercel/kv";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) return NextResponse.json([]);

    // Get all betIds for this user from their Set
    const betIds = await kv.smembers(`user:bets:${userId}`);
    if (!betIds || betIds.length === 0) return NextResponse.json([]);

    // Fetch all bet objects in one shot
    const raw = await kv.mget<any[]>(...betIds.map((id) => `bet:${id}`));
    const bets = raw
      .map((b) => (typeof b === "string" ? JSON.parse(b) : b))
      .filter(Boolean);

    const activeBets = bets.filter((bet) => bet.status === "ACTIVE");

    return NextResponse.json(activeBets);
  } catch (error) {
    console.error("API_ACTIVE_BETS_ERROR:", error);
    return NextResponse.json([]);
  }
}