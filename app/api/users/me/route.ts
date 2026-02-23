import { kv } from "@vercel/kv";
import { NextResponse } from "next/server";
import { auth } from "@/auth";

export async function GET() {
  const session = await auth();
  const myId = session?.user?.id;

  if (!myId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const profile = await kv.get(`user:profile:${myId}`);

  if (!profile) {
    return new Response("Profile not found", { status: 404 });
  }

  return NextResponse.json(profile);
}

export async function PATCH(request: Request) {
    const session = await auth();
    const myId = session?.user?.id;
    if (!myId) {
        return new Response("Unauthorized", { status: 401 });
    }

    const profile = await kv.get(`user:profile:${myId}`);
    if (!profile) {
        return new Response("Profile not found", { status: 404 });
    }

    const body = await request.json();
    const updatedProfile = {
        ...(profile as object),
        letterboxd: body.letterboxd,
    };

    await kv.set(`user:profile:${myId}`, updatedProfile);
    return NextResponse.json(updatedProfile);
}