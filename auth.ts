import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";
import { kv } from "@vercel/kv";

type DiscordProfile = {
  id: string;
  username: string;
  global_name?: string;
  avatar?: string;
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  providers: [
    Discord({
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
      // Added guilds scope to see the user's servers
      authorization: "https://discord.com/api/oauth2/authorize?scope=identify+email+guilds",
    }),
  ],
  callbacks: {
    async signIn({ user, profile, account }) {
      const userId = profile?.id || user?.id;
      if (!userId || !account?.access_token) return false;

      const TARGET_GUILD_ID = process.env.DISCORD_GUILD_ID;

      try {
        // 1. Guild Check
        const res = await fetch("https://discord.com/api/users/@me/guilds", {
          headers: { Authorization: `Bearer ${account.access_token}` },
        });
        if (!res.ok) return false;

        const guilds = await res.json();
        const isMember = guilds.some((g: any) => g.id === TARGET_GUILD_ID);
        // If the user is not a member of the required guild, redirect to a friendly page
        if (!isMember && TARGET_GUILD_ID) return "/not-in-server";

        // 2. Key Definitions
        const profileKey = `user:profile:${userId}`;
        const creditsKey = `user:credits:${userId}`;

        // 3. Check if this is the FIRST connection
        const existingProfile = await kv.get(profileKey);

        if (!existingProfile) {
          // First time! Create the profile
          const newUserProfile = {
            id: userId,
            name: profile?.global_name || profile?.username || user?.name,
            image: user?.image || (profile as any)?.image_url,
          };

          // Set the profile AND the 5000 starting credits
          await Promise.all([
            kv.set(profileKey, newUserProfile),
            kv.set(creditsKey, 10000), // Starting credits
            kv.sadd("all_players", userId),
          ]);

          console.log(`NEW_USER_CREATED: ${userId} initialized with 5000 credits.`);
        } else {
          // Optional: Update existing profile to keep Discord Name/Image in sync
          await kv.set(profileKey, {
            ...existingProfile,
            name: profile?.global_name || profile?.username || user?.name,
            image: user?.image || (profile as any)?.image_url,
          });
        }

        return true;
      } catch (e) {
        console.error("SIGNIN_ERROR:", e);
        return false;
      }
    },

    async session({ session, token }) {
      if (token.discordId && session.user) {
        session.user.id = token.discordId as string;
      }
      return session;
    },


    async jwt({ token, account, profile }) {
      if (account && profile) {
        const discordProfile = profile as DiscordProfile;

        token.discordId = discordProfile.id;
        token.name = discordProfile.global_name ?? discordProfile.username;
      }

      return token;
    }

  },
});