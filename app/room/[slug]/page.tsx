import { ChatRoom } from "@/components/chat-room";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ChatRoom slug={slug} />;
}
