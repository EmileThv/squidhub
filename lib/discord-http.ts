const DISCORD_API = "https://discord.com/api/v10";

type DiscordError = { message?: string; code?: number };

export async function discordFetch(
  path: string,
  init: RequestInit & { botToken: string }
) {
  const { botToken, ...rest } = init;
  const res = await fetch(`${DISCORD_API}${path}`, {
    ...rest,
    headers: {
      "Authorization": `Bot ${botToken}`,
      "Content-Type": "application/json",
      ...(rest.headers || {}),
    },
  });

  let data: any = null;
  try { data = await res.json(); } catch { /* no body */ }

  if (!res.ok) {
    const err = (data ?? {}) as DiscordError;
    console.error(
      `[Discord API] ${rest.method || "GET"} ${path} -> ${res.status}`,
      err ? `code=${err.code} message=${err.message}` : "(no body)"
    );
  }
  return { res, data };
}

// Quick token sanity check
export async function assertBotToken(botToken?: string) {
  if (!botToken) throw new Error("Missing DISCORD_BOT_TOKEN");
  const { res, data } = await discordFetch("/users/@me", {
    method: "GET",
    botToken,
  });
  if (!res.ok) throw new Error(`Bot token invalid: ${res.status} ${JSON.stringify(data)}`);
  return data; // { id, username, ... }
}