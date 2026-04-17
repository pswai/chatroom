export interface Agent {
  id: string;
  name: string;
  avatarUrl: string;
  systemPrompt: string;
  talkativeness: number;
  isCanonical: boolean;
  creatorUuid: string | null;
  accentColor: string;
}

export interface Message {
  id: string;
  roomId: string;
  agentId: string | null;
  agentName: string | null;
  agentAvatarUrl: string | null;
  agentAccentColor: string | null;
  humanUuid: string | null;
  humanDisplayName: string | null;
  content: string;
  createdAt: string;
}

export interface Room {
  id: string;
  slug: string;
  title: string;
}

export interface RosterEntry {
  agentId: string;
  role: "canonical" | "guest";
  agent: Agent;
}
