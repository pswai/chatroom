import { NextRequest, NextResponse } from "next/server";
import { roomManager } from "@/lib/room-manager";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { room, humanUuid, displayName, content } = body;

  if (!room || !humanUuid || !displayName || !content) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const message = roomManager.addHumanMessage(
    room,
    humanUuid,
    displayName,
    content
  );

  if (!message) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  return NextResponse.json({ message });
}
