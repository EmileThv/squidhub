"use server";
import { kv } from "@vercel/kv";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { sendDiscordBetRequest } from "@/lib/discord";

export async function createBet(receiverId: string, amount: number, title: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("AUTH_REQUIRED");

  const senderId = session.user.id;

  try {
    const currentCredits = await kv.get<number>(`user:credits:${senderId}`) ?? 5000;
    if (currentCredits < amount) throw new Error("INSUFFICIENT_CREDITS");
    if (receiverId === senderId) throw new Error("CANNOT_BET_SELF");

    // Check neither player already has an active/pending bet
    const checkForActiveBet = async (userId: string): Promise<boolean> => {
      const betIds = await kv.smembers(`user:bets:${userId}`);
      if (!betIds || betIds.length === 0) return false;
      const bets = await kv.mget<any[]>(...betIds.map((id) => `bet:${id}`));
      return bets.some((b) => b?.status === "ACTIVE" || b?.status === "PENDING");
    };

    if (await checkForActiveBet(senderId)) throw new Error("SENDER_HAS_ACTIVE_BET");
    if (await checkForActiveBet(receiverId)) throw new Error("RECEIVER_HAS_ACTIVE_BET");

    const betId = Math.random().toString(36).substr(2, 9);
    const betData = {
      id: betId,
      amount,
      title: title || "DEMO_BET",
      senderId,
      senderName: session.user.name,
      receiverId,
      status: "PENDING",
      createdAt: Date.now(),
      discordBetSent: false,
    };

    // Single source of truth: one key per bet, users hold sets of betIds
    await kv.set(`bet:${betId}`, JSON.stringify(betData));
    await kv.sadd(`user:bets:${senderId}`, betId);
    await kv.sadd(`user:bets:${receiverId}`, betId);

    await sendDiscordBetRequest({
      receiverId,
      senderId,
      senderName: session.user.name || "Un utilisateur",
      amount,
      title: title || "DEMO_BET",
      betId,
    });

    revalidatePath("/bets");
    return { success: true };

  } catch (e: any) {
    console.error("DEBUG_BET_ERROR:", e);
    return { success: false, error: e?.message ?? "UNKNOWN_ERROR" };
  }
}