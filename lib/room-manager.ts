import { Agent, Message, RosterEntry, Room } from "./types";
import { CANONICAL_AGENTS, ROOM_CONFIG, STUB_RESPONSES } from "./agents";

type SSECallback = (eventType: string, data: unknown) => void;

interface RoomState {
  id: string;
  slug: string;
  title: string;
  subscribers: Set<SSECallback>;
  heartbeats: Map<string, number>;
  messages: Message[];
  roster: Map<string, Agent>;
  canonicalIds: Set<string>;
  lastSpeakerId: string | null;
  aiMessagesSinceHuman: number;
  lastMessageAt: number;
  loopTimer: ReturnType<typeof setInterval> | null;
  isGenerating: boolean;
}

let messageCounter = 0;
function nextMessageId(): string {
  return `msg-${Date.now()}-${++messageCounter}`;
}

let agentCounter = 0;
function nextAgentId(): string {
  return `persona-${Date.now()}-${++agentCounter}`;
}

class RoomManager {
  private rooms = new Map<string, RoomState>();
  private allAgents = new Map<string, Agent>();
  private userPersonas: Agent[] = [];
  private janitorTimer: ReturnType<typeof setInterval>;

  constructor() {
    for (const agent of CANONICAL_AGENTS) {
      this.allAgents.set(agent.id, agent);
    }
    this.initRoom();
    this.janitorTimer = setInterval(() => this.cleanup(), 15_000);
  }

  private initRoom() {
    const room: RoomState = {
      id: ROOM_CONFIG.id,
      slug: ROOM_CONFIG.slug,
      title: ROOM_CONFIG.title,
      subscribers: new Set(),
      heartbeats: new Map(),
      messages: [],
      roster: new Map(),
      canonicalIds: new Set(),
      lastSpeakerId: null,
      aiMessagesSinceHuman: 0,
      lastMessageAt: 0,
      loopTimer: null,
      isGenerating: false,
    };

    for (const agent of CANONICAL_AGENTS) {
      room.roster.set(agent.id, agent);
      room.canonicalIds.add(agent.id);
    }

    this.rooms.set(ROOM_CONFIG.slug, room);
  }

  // --- SSE ---

  subscribe(slug: string, callback: SSECallback): () => void {
    const room = this.rooms.get(slug);
    if (!room) return () => {};
    room.subscribers.add(callback);
    return () => {
      room.subscribers.delete(callback);
    };
  }

  private broadcast(room: RoomState, eventType: string, data: unknown) {
    for (const cb of room.subscribers) {
      try {
        cb(eventType, data);
      } catch {
        /* client disconnected */
      }
    }
  }

  // --- Heartbeat ---

  heartbeat(slug: string, sessionId: string) {
    const room = this.rooms.get(slug);
    if (!room) return;
    room.heartbeats.set(sessionId, Date.now());
    if (!room.loopTimer) {
      this.startLoop(room);
    }
  }

  getPresence(slug: string): number {
    const room = this.rooms.get(slug);
    if (!room) return 0;
    const now = Date.now();
    let count = 0;
    for (const ts of room.heartbeats.values()) {
      if (now - ts < 30_000) count++;
    }
    return count;
  }

  // --- Messages ---

  getMessages(slug: string, limit = 30): Message[] {
    const room = this.rooms.get(slug);
    if (!room) return [];
    return room.messages.slice(-limit);
  }

  addHumanMessage(
    slug: string,
    humanUuid: string,
    displayName: string,
    content: string
  ): Message | null {
    const room = this.rooms.get(slug);
    if (!room) return null;

    const message: Message = {
      id: nextMessageId(),
      roomId: room.id,
      agentId: null,
      agentName: null,
      agentAvatarUrl: null,
      agentAccentColor: null,
      humanUuid,
      humanDisplayName: displayName,
      content,
      createdAt: new Date().toISOString(),
    };

    room.messages.push(message);
    room.aiMessagesSinceHuman = 0;
    room.lastMessageAt = Date.now();
    this.broadcast(room, "message", message);

    if (!room.loopTimer) {
      this.startLoop(room);
    }

    return message;
  }

  // --- Roster ---

  getRoster(slug: string): RosterEntry[] {
    const room = this.rooms.get(slug);
    if (!room) return [];
    const entries: RosterEntry[] = [];
    for (const [agentId, agent] of room.roster) {
      entries.push({
        agentId,
        role: room.canonicalIds.has(agentId) ? "canonical" : "guest",
        agent,
      });
    }
    return entries;
  }

  summonAgent(
    slug: string,
    agentId: string
  ): { success: boolean; error?: string } {
    const room = this.rooms.get(slug);
    if (!room) return { success: false, error: "Room not found" };
    if (room.roster.has(agentId))
      return { success: false, error: "Already in room" };

    const guestCount = [...room.roster.keys()].filter(
      (id) => !room.canonicalIds.has(id)
    ).length;
    if (guestCount >= 3)
      return { success: false, error: "Guest slots full (max 3)" };

    const agent = this.allAgents.get(agentId);
    if (!agent) return { success: false, error: "Persona not found" };

    room.roster.set(agentId, agent);
    this.broadcast(room, "roster", this.getRoster(slug));
    return { success: true };
  }

  kickAgent(
    slug: string,
    agentId: string
  ): { success: boolean; error?: string } {
    const room = this.rooms.get(slug);
    if (!room) return { success: false, error: "Room not found" };
    if (room.canonicalIds.has(agentId))
      return { success: false, error: "Cannot kick canonical agents" };
    if (!room.roster.has(agentId))
      return { success: false, error: "Agent not in room" };

    room.roster.delete(agentId);
    this.broadcast(room, "roster", this.getRoster(slug));
    return { success: true };
  }

  // --- Personas ---

  createPersona(
    name: string,
    systemPrompt: string,
    creatorUuid: string,
    accentColor: string
  ): Agent {
    const agent: Agent = {
      id: nextAgentId(),
      name,
      avatarUrl: "",
      systemPrompt,
      talkativeness: 0.6,
      isCanonical: false,
      creatorUuid,
      accentColor,
    };
    this.allAgents.set(agent.id, agent);
    this.userPersonas.push(agent);
    return agent;
  }

  getUserPersonas(): Agent[] {
    return [...this.userPersonas];
  }

  // --- Turn Loop ---

  private startLoop(room: RoomState) {
    if (room.loopTimer) return;
    room.loopTimer = setInterval(() => this.tick(room), 1000);
  }

  private stopLoop(room: RoomState) {
    if (room.loopTimer) {
      clearInterval(room.loopTimer);
      room.loopTimer = null;
    }
  }

  private isActive(room: RoomState): boolean {
    const now = Date.now();
    for (const ts of room.heartbeats.values()) {
      if (now - ts < 30_000) return true;
    }
    return false;
  }

  private async tick(room: RoomState) {
    if (!this.isActive(room)) {
      this.stopLoop(room);
      return;
    }
    if (room.isGenerating) return;

    const now = Date.now();
    const effectiveGap =
      room.aiMessagesSinceHuman > 5
        ? 15_000
        : 3000 + Math.random() * 5000;

    if (now - room.lastMessageAt < effectiveGap) return;
    if (room.aiMessagesSinceHuman >= 15) return;

    room.isGenerating = true;
    try {
      await this.generateTurn(room);
    } catch (err) {
      console.error("[turn-loop] Error:", err);
    } finally {
      room.isGenerating = false;
    }
  }

  private async generateTurn(room: RoomState) {
    const candidates = [...room.roster.values()].filter(
      (a) => a.id !== room.lastSpeakerId
    );
    if (candidates.length === 0) return;

    const lastMsg = room.messages[room.messages.length - 1];
    const humanJustSpoke = lastMsg?.humanUuid != null;

    const weights = candidates.map((a) => {
      let w = a.talkativeness;
      if (humanJustSpoke) w *= 3;
      if (
        lastMsg &&
        lastMsg.content.toLowerCase().includes(a.name.toLowerCase())
      ) {
        w *= 2;
      }
      return w;
    });

    const chosen = this.weightedRandom(candidates, weights);
    if (!chosen) return;

    const content = await this.generate(chosen, room);
    if (!content?.trim()) return;

    const message: Message = {
      id: nextMessageId(),
      roomId: room.id,
      agentId: chosen.id,
      agentName: chosen.name,
      agentAvatarUrl: chosen.avatarUrl,
      agentAccentColor: chosen.accentColor,
      humanUuid: null,
      humanDisplayName: null,
      content: content.trim(),
      createdAt: new Date().toISOString(),
    };

    room.messages.push(message);
    room.lastMessageAt = Date.now();
    room.lastSpeakerId = chosen.id;
    room.aiMessagesSinceHuman++;
    this.broadcast(room, "message", message);
  }

  private async generate(agent: Agent, _room: RoomState): Promise<string> {
    // Phase 1: stub mode only. Real AI providers wired in Phase 3.
    return this.generateStub(agent.id, agent.name);
  }

  private generateStub(agentId: string, agentName: string): string {
    const responses = STUB_RESPONSES[agentId];
    if (responses && responses.length > 0) {
      return responses[Math.floor(Math.random() * responses.length)];
    }
    const fallbacks = [
      `Interesting point. As ${agentName}, I have a unique perspective on this.`,
      `I find this whole dynamic fascinating, honestly.`,
      `I agree with some of what's been said, but I see it a bit differently.`,
      `That reminds me of something I've been thinking about lately.`,
    ];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }

  private weightedRandom<T>(items: T[], weights: number[]): T | null {
    const total = weights.reduce((sum, w) => sum + w, 0);
    if (total === 0) return null;
    let rand = Math.random() * total;
    for (let i = 0; i < items.length; i++) {
      rand -= weights[i];
      if (rand <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  // --- Room info ---

  getRoom(slug: string): Room | null {
    const room = this.rooms.get(slug);
    if (!room) return null;
    return { id: room.id, slug: room.slug, title: room.title };
  }

  // --- Cleanup ---

  private cleanup() {
    const now = Date.now();
    for (const room of this.rooms.values()) {
      for (const [sessionId, ts] of room.heartbeats) {
        if (now - ts > 60_000) {
          room.heartbeats.delete(sessionId);
        }
      }
      this.broadcast(room, "presence", {
        humans: this.getPresence(room.slug),
      });
    }
  }
}

const g = globalThis as unknown as { __roomManager?: RoomManager };
export const roomManager = g.__roomManager ?? new RoomManager();
if (process.env.NODE_ENV !== "production") {
  g.__roomManager = roomManager;
}
