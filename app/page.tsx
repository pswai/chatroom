import { redirect } from "next/navigation";
import { ROOM_CONFIG } from "@/lib/agents";

export default function Home() {
  redirect(`/room/${ROOM_CONFIG.slug}`);
}
