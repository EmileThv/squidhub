"use server";
import { kv } from "@vercel/kv";
import { sendDiscordResolutionRequest } from "@/lib/discord";

export async function initiateResolution(bet: any, winnerId: string, initiatorId: string) {
  // Fetch the live bet object directly by ID — no list scanning
  const raw = await kv.get<any>(`bet:${bet.id}`);
  const liveBet = typeof raw === "string" ? JSON.parse(raw) : raw;

  if (!liveBet) throw new Error("BET_NOT_FOUND");
  if (liveBet.status !== "ACTIVE") throw new Error("BET_NOT_ACTIVE");

  liveBet.status = "PENDING_VALIDATION";
  liveBet.claimedWinner = winnerId;

  // Single write — both users automatically see the update since they share the same bet key
  await kv.set(`bet:${liveBet.id}`, JSON.stringify(liveBet));

  const opponentId = initiatorId === liveBet.senderId ? liveBet.receiverId : liveBet.senderId;

  await sendDiscordResolutionRequest({
    opponentId,
    initiatorName: liveBet.senderName || "ERREUR NOM",
    amount: liveBet.amount * 2,
    betId: liveBet.id,
    claimedWinnerId: winnerId,
  });

  return { success: true };
}