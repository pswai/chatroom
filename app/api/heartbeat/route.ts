import { NextRequest, NextResponse } from "next/server";
import { roomManager } from "@/lib/room-manager";

export async function POST(request: NextRequest) {
  const { room, sessionId } = await request.json();

  if (!room || !sessionId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  roomManager.heartbeat(room, sessionId);

  return NextResponse.json({
    presence: roomManager.getPresence(room),
  });
}
