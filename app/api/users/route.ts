import { kv } from "@vercel/kv";
import { NextResponse } from "next/server";
import { auth } from "@/auth";

export async function GET() {
  const session = await auth();
  const myId = session?.user?.id;

  // 1. On récupère la liste des IDs des joueurs enregistrés
  const allUserIds = await kv.smembers("all_players");

  // 2. On récupère les infos de chaque profil en parallèle
  const users = await Promise.all(
    allUserIds
      .slice(0, 10)
      .map(async (id) => {
        const profile = await kv.get(`user:profile:${id}`);
        return profile || null;
      })
  );

  // On filtre les profils qui pourraient être corrompus/vides
  return NextResponse.json(users.filter(u => u !== null));
}