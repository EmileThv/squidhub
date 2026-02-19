import { auth } from "@/auth";
import { kv } from "@vercel/kv";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const credits = await kv.get<number>(`user:credits:${session.user.id}`) ?? 5000;

  return Response.json({ credits });
}