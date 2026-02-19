import { discordFetch, assertBotToken } from "./discord-http";
import { kv } from "@vercel/kv";

type DiscordResult =
  | { ok: true }
  | { ok: false; reason: "DMS_CLOSED" | "DISCORD_ERROR" };

/* ------------------------------------------------------------------ */
/* BET REQUEST                                                         */
/* ------------------------------------------------------------------ */

export async function sendDiscordBetRequest({
  receiverId,
  senderName,
  senderId,
  amount,
  title,
  betId,
}: {
  receiverId: string;
  senderName: string;
  senderId: string;
  amount: number;
  title: string;
  betId: string;
}): Promise<DiscordResult> {
  const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN?.trim();
  await assertBotToken(BOT_TOKEN);

  const sentKey = `discord:sent:bet:${betId}`;
  if (await kv.get(sentKey)) {
    console.log(`[Discord] Bet DM already sent for ${betId}`);
    return { ok: true };
  }

  // 1) Open DM
  const open = await discordFetch("/users/@me/channels", {
    method: "POST",
    botToken: BOT_TOKEN!,
    body: JSON.stringify({ recipient_id: receiverId }),
  });

  if (!open.res.ok || !open.data?.id) {
    console.error("[Discord] Failed to open DM", open.res.status, open.data);
    return { ok: false, reason: "DISCORD_ERROR" };
  }

  // 2) Send message
  const send = await discordFetch(`/channels/${open.data.id}/messages`, {
    method: "POST",
    botToken: BOT_TOKEN!,
    body: JSON.stringify({
      content: `### NOUVEAU PARI REÇU !
**${senderName}** vous défie pour **${amount} CR** sur :
\`${title}\``,
      components: [
        {
          type: 1,
          components: [
            { type: 2, label: "ACCEPTER", style: 3, custom_id: `accept:${senderId}:${betId}` },
            { type: 2, label: "DÉCLINER", style: 4, custom_id: `deny:${senderId}:${betId}` },
          ],
        },
      ],
    }),
  });

  if (!send.res.ok) {
    const code = Number(send.data?.code || 0);

    if (send.res.status === 403 && code === 50007) {
      console.warn(`[Discord] DMs closed for user ${receiverId}`);
      return { ok: false, reason: "DMS_CLOSED" };
    }

    console.error("[Discord] Failed to send bet DM", send.res.status, send.data);
    return { ok: false, reason: "DISCORD_ERROR" };
  }


  await kv.set(sentKey, true);

  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* RESOLUTION REQUEST                                                  */
/* ------------------------------------------------------------------ */

export async function sendDiscordResolutionRequest({
  opponentId,
  initiatorName,
  amount,
  betId,
  claimedWinnerId,
}: {
  opponentId: string;
  initiatorName: string;
  amount: number;
  betId: string;
  claimedWinnerId: string;
}): Promise<DiscordResult> {
  const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN?.trim();
  await assertBotToken(BOT_TOKEN);

  const sentKey = `discord:sent:resolution:${betId}`;
  if (await kv.get(sentKey)) {
    console.log(`[Discord] Resolution DM already sent for ${betId}`);
    return { ok: true };
  }

  const open = await discordFetch("/users/@me/channels", {
    method: "POST",
    botToken: BOT_TOKEN!,
    body: JSON.stringify({ recipient_id: opponentId }),
  });

  if (!open.res.ok || !open.data?.id) {
    console.error("[Discord] Failed to open resolution DM", open.res.status, open.data);
    return { ok: false, reason: "DISCORD_ERROR" };
  }

  const send = await discordFetch(`/channels/${open.data.id}/messages`, {
    method: "POST",
    botToken: BOT_TOKEN!,
    body: JSON.stringify({
      content: `**Demande de clôture de pari !**

**${initiatorName}** déclare que le gagnant des **${amount} CR** est <@${claimedWinnerId}>.

Es-tu d'accord avec ce résultat ?`,
      components: [
        {
          type: 1,
          components: [
            { type: 2, style: 3, label: "OUI, ACCEPTER", custom_id: `resolve_accept:${betId}:${claimedWinnerId}` },
            { type: 2, style: 4, label: "NON, CONTESTER", custom_id: `resolve_contest:${betId}` },
          ],
        },
      ],
    }),
  });

  if (!send.res.ok) {
    console.error("[Discord] Failed to send resolution DM", send.res.status, send.data);
    return { ok: false, reason: "DISCORD_ERROR" };
  }

  await kv.set(sentKey, true);

  return { ok: true };
}