import { NextRequest, NextResponse } from "next/server";
import { roomManager } from "@/lib/room-manager";

export async function GET() {
  return NextResponse.json({
    personas: roomManager.getUserPersonas(),
  });
}

export async function POST(request: NextRequest) {
  const { name, systemPrompt, creatorUuid, accentColor } =
    await request.json();

  if (!name || !systemPrompt || !creatorUuid) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const agent = roomManager.createPersona(
    name.trim(),
    systemPrompt.trim(),
    creatorUuid,
    accentColor || "#8b5cf6"
  );

  return NextResponse.json({ agent });
}
