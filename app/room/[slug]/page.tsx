import { redirect } from "next/navigation";
import { ChatRoom } from "@/components/chat-room";
import { ROOM_CONFIG } from "@/lib/agents";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (slug !== ROOM_CONFIG.slug) {
    redirect("/");
  }
  return <ChatRoom slug={slug} />;
}
