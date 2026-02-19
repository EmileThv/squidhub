import { NextResponse } from "next/server";
import { verifyKey } from "discord-interactions";
import { kv } from "@vercel/kv";

export const dynamic = "force-dynamic";

// Helper: fetch and parse a bet by ID directly
async function getBet(betId: string): Promise<any | null> {
  const raw = await kv.get<any>(`bet:${betId}`);
  if (!raw) return null;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

// Helper: save a bet back
async function saveBet(bet: any) {
  await kv.set(`bet:${bet.id}`, JSON.stringify(bet));
}

export async function POST(req: Request) {
  const signature = req.headers.get("x-signature-ed25519");
  const timestamp = req.headers.get("x-signature-timestamp");
  const publicKey = process.env.DISCORD_PUBLIC_KEY?.trim();

  if (!signature || !timestamp || !publicKey) {
    console.error("Missing signature/timestamp/publicKey");
    return new Response("Invalid request signature", { status: 401 });
  }

  const rawBody = await req.text();

  try {
    const isValid = await verifyKey(
      new TextEncoder().encode(rawBody),
      signature,
      timestamp,
      publicKey
    );
    if (!isValid) return new Response("Invalid request signature", { status: 401 });
  } catch (e: any) {
    console.error("verifyKey threw:", e?.message ?? e);
    return new Response("Invalid request signature", { status: 401 });
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  // PING
  if (body.type === 1) {
    return NextResponse.json({ type: 1 }, { status: 200 });
  }

  const getUserId = (payload: any): string | undefined =>
    payload.member?.user?.id ?? payload.user?.id;

  try {
    if (body.type === 3) {
      const { custom_id } = body.data;
      const clickerId = getUserId(body);

      if (!clickerId) {
        return NextResponse.json({ type: 4, data: { content: "Utilisateur introuvable.", flags: 64 } });
      }

      // ===== CASE 1: Resolution flow — resolve_accept:<betId>:<winnerId> or resolve_contest:<betId> =====
      if (custom_id.startsWith("resolve_")) {
        const parts = custom_id.split(":");
        const action = parts[0]; // "resolve_accept" or "resolve_contest"
        const betId = parts[1];
        const winnerId = parts[2]; // undefined for contest

        if (!betId) {
          return NextResponse.json({ type: 4, data: { content: "Paramètres manquants.", flags: 64 } });
        }

        const bet = await getBet(betId);
        if (!bet) {
          return NextResponse.json({ type: 4, data: { content: "Pari introuvable.", flags: 64 } });
        }

        if (action === "resolve_accept" && winnerId) {
          await kv.incrby(`user:credits:${winnerId}`, bet.amount * 2);
          bet.status = "COMPLETED";
          bet.winnerId = winnerId;
        } else {
          // Contest: refund both players
          await kv.incrby(`user:credits:${bet.senderId}`, bet.amount);
          await kv.incrby(`user:credits:${bet.receiverId}`, bet.amount);
          bet.status = "CONTESTED";
        }

        await saveBet(bet);

        return NextResponse.json({
          type: 7,
          data: {
            content: action === "resolve_accept"
              ? `**Pari validé.** <@${winnerId}> encaisse **${bet.amount * 2} CR** !`
              : `**Pari contesté.** Les mises ont été rendues.`,
            components: [],
          },
        });
      }

      // ===== CASE 2: Initial accept/deny — accept:<senderId>:<betId> or deny:<senderId>:<betId> =====
      const parts = custom_id.split(":");
      if (parts.length === 3) {
        const [action, senderId, betId] = parts;

        const bet = await getBet(betId);
        if (!bet) {
          return NextResponse.json({ type: 4, data: { content: "Pari expiré.", flags: 64 } });
        }

        if (action === "accept") {
          const receiverCredits = await kv.get<number>(`user:credits:${clickerId}`) ?? 5000;
          if (receiverCredits < bet.amount) {
            return NextResponse.json({
              type: 7,
              data: { content: "**Pari refusé automatiquement.** Crédits insuffisants pour accepter.", components: [] },
            });
          }

          await kv.decrby(`user:credits:${clickerId}`, bet.amount);
          await kv.decrby(`user:credits:${senderId}`, bet.amount);
          bet.status = "ACTIVE";
          await saveBet(bet);

          return NextResponse.json({
            type: 7,
            data: { content: "**Pari Accepté !** Bonne chance.", components: [] },
          });
        }

        if (action === "deny") {
          bet.status = "DECLINED";
          await saveBet(bet);
          return NextResponse.json({
            type: 7,
            data: { content: "Pari refusé.", components: [] },
          });
        }
      }

      return NextResponse.json({ type: 4, data: { content: "Action inconnue.", flags: 64 } });
    }

    return NextResponse.json({ error: "Unknown interaction" }, { status: 400 });
  } catch (err: any) {
    console.error("ERREUR CRITIQUE INTERACTION:", err?.message, err?.stack);
    return NextResponse.json({
      type: 4,
      data: { content: `Erreur interne: ${err?.message ?? "inconnue"}`, flags: 64 },
    });
  }
}