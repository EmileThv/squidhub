import { NextResponse } from "next/server";
import { verifyKey } from "discord-interactions";
import { kv } from "@vercel/kv";

// For serverless: avoid caching this route
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // --- 1) SECURITY: verify signature first
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

    if (!isValid) {
      console.error("Invalid request signature");
      return new Response("Invalid request signature", { status: 401 });
    }
  } catch (e: any) {
    console.error("verifyKey threw:", e?.message ?? e);
    return new Response("Invalid request signature", { status: 401 });
  }

  // --- 2) Now it's safe to parse and process
  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch (e) {
    console.error("Unable to JSON.parse body:", e);
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  // 2.a) PING/PONG (type: 1)
  if (body.type === 1) {
    return NextResponse.json({ type: 1 }, { status: 200 });
  }

  // 2.b) Utility: robust user id extraction (DM vs Guild)
  const getUserId = (payload: any): string | undefined =>
    payload.member?.user?.id ?? payload.user?.id;

  try {
    // --- 3) COMPONENT INTERACTIONS (Buttons etc.) ---
    if (body.type === 3) {
      const { custom_id } = body.data;
      const receiverId = getUserId(body);
      const userId = receiverId; // keep your variable naming

      if (!receiverId) {
        return NextResponse.json({
          type: 4,
          data: { content: "Utilisateur introuvable.", flags: 64 }
        });
      }

      console.log(`Bouton cliqué: ${custom_id} par ${userId}`);

      // ===== CASE 1: Resolve flow (OUI/NON) =====
      if (custom_id.startsWith("resolve_")) {
        // expect something like: resolve_accept:<betId>:<winnerId> OR resolve_deny:<betId>:<winnerId>
        const [action, betId, winnerId] = custom_id.split(":");

        if (!betId || !winnerId) {
          return NextResponse.json({ type: 4, data: { content: "Paramètres manquants.", flags: 64 } });
        }

        // Load receiver's bets (they clicked the button on their side)
        const receiverBets = await kv.lrange<any>(`user:bets:${receiverId}`, 0, -1);

        // Normalize entries (KV may return strings)
        const rBets = receiverBets.map((b: any) => (typeof b === "string" ? JSON.parse(b) : b));
        const rIndex = rBets.findIndex((b: any) => b?.id === betId);

        if (rIndex === -1) {
          return NextResponse.json({ type: 4, data: { content: "Pari introuvable.", flags: 64 } });
        }

        const bet = rBets[rIndex];

        if (action === "resolve_accept") {
          const totalPot = bet.amount * 2;
          await kv.incrby(`user:credits:${winnerId}`, totalPot);
          bet.status = "COMPLETED";
        } else {
          // Treat any non-accept as contest for safety
          await kv.incrby(`user:credits:${bet.senderId}`, bet.amount);
          await kv.incrby(`user:credits:${bet.receiverId}`, bet.amount);
          bet.status = "CONTESTED";
        }

        // Update both users' lists
        const senderBets = await kv.lrange<any>(`user:bets:${bet.senderId}`, 0, -1);
        const sBets = senderBets.map((b: any) => (typeof b === "string" ? JSON.parse(b) : b));
        const sIndex = sBets.findIndex((b: any) => b?.id === bet.id);

        if (rIndex !== -1) {
          await kv.lset(`user:bets:${receiverId}`, rIndex, JSON.stringify(bet));
        }
        if (sIndex !== -1) {
          await kv.lset(`user:bets:${bet.senderId}`, sIndex, JSON.stringify(bet));
        }

        return NextResponse.json({
          type: 7, // update original message
          data: {
            content:
              custom_id.startsWith("resolve_accept")
                ? `**Pari validé.** <@${winnerId}> encaisse **${bet.amount * 2} CR** !`
                : `**Pari contesté.** Les mises ont été rendues.`,
            components: [] // remove buttons
          }
        });
      }

      // ===== CASE 2: Initial accept/deny (first DM) =====
      // Expected: "<action>:<senderId>:<betId>" e.g., "accept:123:abc" or "deny:123:abc"
      const parts = custom_id.split(":");
      if (parts.length === 3) {
        const [action, senderId, betId] = parts;

        // Pull sender's list to locate the bet
        const betsRaw = await kv.lrange<any>(`user:bets:${senderId}`, 0, -1);
        const bets = betsRaw.map((b: any) => (typeof b === "string" ? JSON.parse(b) : b));
        const betIndex = bets.findIndex((b: any) => b?.id === betId);

        if (betIndex === -1) {
          return NextResponse.json({ type: 4, data: { content: "Pari expiré.", flags: 64 } });
        }

        const bet = bets[betIndex];

        if (action === "accept") {
          // debit the receiver
          await kv.decrby(`user:credits:${receiverId}`, bet.amount);
          await kv.decrby(`user:credits:${senderId}`, bet.amount); 
          bet.status = "ACTIVE";

          // Update sender's stored list
          await kv.lset(`user:bets:${senderId}`, betIndex, JSON.stringify(bet));
          // Add to receiver's list so they have the bet overlay
          await kv.lpush(`user:bets:${receiverId}`, JSON.stringify(bet));

          return NextResponse.json({
            type: 7,
            data: { content: `**Pari Accepté !** Bonne chance.`, components: [] }
          });
        }

        if (action === "deny") {
          bet.status = "DECLINED";
          await kv.lset(`user:bets:${senderId}`, betIndex, JSON.stringify(bet));
          return NextResponse.json({ type: 7, data: { content: "Pari refusé.", components: [] } });
        }
      }

      // Unknown component
      return NextResponse.json({ type: 4, data: { content: "Action inconnue.", flags: 64 } });
    }


    return NextResponse.json({ error: "Unknown interaction" }, { status: 400 });
  } catch (err: any) {
    console.error("ERREUR CRITIQUE INTERACTION:", err?.message, err?.stack);
    // Always return a valid Discord response even on failure
    return NextResponse.json({
      type: 4,
      data: { content: `Erreur interne: ${err?.message ?? "inconnue"}`, flags: 64 }
    });
  }
}
