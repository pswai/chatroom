"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Message, RosterEntry } from "@/lib/types";
import { MessageBubble } from "@/components/message-bubble";
import { Composer } from "@/components/composer";
import { RosterSidebar } from "@/components/roster-sidebar";

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("chatroom-session-id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("chatroom-session-id", id);
  }
  return id;
}

function getDisplayName(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("chatroom-display-name");
}

function saveDisplayName(name: string) {
  localStorage.setItem("chatroom-display-name", name);
}

export function ChatRoom({ slug }: { slug: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [presence, setPresence] = useState(0);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [roomTitle, setRoomTitle] = useState("");
  const sessionId = useRef("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sessionId.current = getSessionId();
    setDisplayName(getDisplayName());
  }, []);

  // SSE connection
  useEffect(() => {
    const es = new EventSource(`/api/stream/${slug}`);

    es.addEventListener("init", (e) => {
      const data = JSON.parse(e.data);
      setMessages(data.messages || []);
      setRoster(data.roster || []);
      setPresence(data.presence || 0);
      setRoomTitle(data.room?.title || "");
      setConnected(true);
    });

    es.addEventListener("message", (e) => {
      const msg: Message = JSON.parse(e.data);
      setMessages((prev) => [...prev, msg]);
    });

    es.addEventListener("roster", (e) => {
      setRoster(JSON.parse(e.data));
    });

    es.addEventListener("presence", (e) => {
      const data = JSON.parse(e.data);
      setPresence(data.humans || 0);
    });

    es.onerror = () => setConnected(false);
    es.onopen = () => setConnected(true);

    return () => es.close();
  }, [slug]);

  // Heartbeat
  useEffect(() => {
    if (!sessionId.current) return;
    const beat = () => {
      fetch("/api/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room: slug,
          sessionId: sessionId.current,
        }),
      }).catch(() => {});
    };
    beat();
    const timer = setInterval(beat, 10_000);
    return () => clearInterval(timer);
  }, [slug]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(
    async (content: string) => {
      if (!displayName) return;
      await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room: slug,
          humanUuid: sessionId.current,
          displayName,
          content,
        }),
      });
    },
    [slug, displayName]
  );

  const handleJoin = useCallback((name: string) => {
    saveDisplayName(name);
    setDisplayName(name);
  }, []);

  const handleSummon = useCallback(
    async (agentId: string) => {
      await fetch("/api/summon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room: slug,
          agentId,
          sessionId: sessionId.current,
        }),
      });
    },
    [slug]
  );

  const handleKick = useCallback(
    async (agentId: string) => {
      await fetch("/api/summon", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room: slug, agentId }),
      });
    },
    [slug]
  );

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100">
      <div className="flex flex-col flex-1 min-w-0">
        <header className="flex items-center justify-between px-6 py-3 border-b border-gray-800 shrink-0">
          <div>
            <h1 className="text-base font-semibold tracking-tight">
              {roomTitle || "Loading..."}
            </h1>
            <p className="text-xs text-gray-600">
              {connected
                ? `${presence} human${presence !== 1 ? "s" : ""} watching`
                : "Connecting..."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`}
            />
            <span className="text-xs text-gray-600">
              {connected ? "Live" : "Offline"}
            </span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-0.5">
          {messages.length === 0 && connected && (
            <p className="text-sm text-gray-600 text-center py-12">
              The session is about to begin...
            </p>
          )}
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="px-6 py-4 border-t border-gray-800 shrink-0">
          {displayName ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-gray-600">
                <span>Chatting as <span className="text-gray-400">{displayName}</span></span>
                <button
                  onClick={() => {
                    localStorage.removeItem("chatroom-display-name");
                    setDisplayName(null);
                  }}
                  className="text-gray-600 hover:text-gray-300 transition-colors"
                >
                  (change)
                </button>
              </div>
              <Composer onSend={handleSend} />
            </div>
          ) : (
            <JoinPrompt onJoin={handleJoin} />
          )}
        </div>
      </div>

      <RosterSidebar
        roster={roster}
        presence={presence}
        onSummon={handleSummon}
        onKick={handleKick}
        sessionId={sessionId.current}
      />
    </div>
  );
}

function JoinPrompt({ onJoin }: { onJoin: (name: string) => void }) {
  const [name, setName] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onJoin(name.trim());
      }}
      className="flex gap-2"
    >
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Enter your name to join the conversation..."
        className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-gray-500 text-sm"
        autoFocus
      />
      <button
        type="submit"
        disabled={!name.trim()}
        className="px-5 py-2.5 bg-white text-gray-900 rounded-lg font-medium text-sm hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        Join
      </button>
    </form>
  );
}
