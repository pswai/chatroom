import { roomManager } from "@/lib/room-manager";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (eventType: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(
              `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`
            )
          );
        } catch {
          /* stream closed */
        }
      };

      send("init", {
        room: roomManager.getRoom(slug),
        roster: roomManager.getRoster(slug),
        messages: roomManager.getMessages(slug, 50),
        presence: roomManager.getPresence(slug),
      });

      const unsubscribe = roomManager.subscribe(slug, send);

      request.signal.addEventListener("abort", () => {
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
