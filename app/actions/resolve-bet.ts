"use server";
import { kv } from "@vercel/kv";
import { auth } from "@/auth";
import { sendDiscordResolutionRequest } from "@/lib/discord";

export async function initiateResolution(betId: string, winnerId: string) {
  const session = await auth();
  const initiatorId = session?.user?.id;
  if (!initiatorId) throw new Error("AUTH_REQUIRED");

  // Fetch the live bet object directly by ID — no list scanning
  const raw = await kv.get<any>(`bet:${betId}`);
  const liveBet = typeof raw === "string" ? JSON.parse(raw) : raw;

  if (!liveBet) throw new Error("BET_NOT_FOUND");
  if (liveBet.status !== "ACTIVE") throw new Error("BET_NOT_ACTIVE");

  const participants = [liveBet.senderId, liveBet.receiverId];
  if (!participants.includes(initiatorId)) throw new Error("NOT_A_PARTICIPANT");
  if (!participants.includes(winnerId)) throw new Error("INVALID_WINNER");

  liveBet.status = "PENDING_VALIDATION";
  liveBet.claimedWinner = winnerId;
  liveBet.resolutionInitiatorId = initiatorId;

  // Single write — both users automatically see the update since they share the same bet key
  await kv.set(`bet:${liveBet.id}`, JSON.stringify(liveBet));

  const opponentId = initiatorId === liveBet.senderId ? liveBet.receiverId : liveBet.senderId;

  await sendDiscordResolutionRequest({
    opponentId,
    initiatorName: session.user?.name || "Un utilisateur",
    amount: liveBet.amount * 2,
    betId: liveBet.id,
    claimedWinnerId: winnerId,
  });

  return { success: true };
}
