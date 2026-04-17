import { NextRequest, NextResponse } from "next/server";
import { roomManager } from "@/lib/room-manager";

export async function POST(request: NextRequest) {
  const { room, agentId } = await request.json();

  if (!room || !agentId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const result = roomManager.summonAgent(room, agentId);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const { room, agentId } = await request.json();

  if (!room || !agentId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const result = roomManager.kickAgent(room, agentId);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
