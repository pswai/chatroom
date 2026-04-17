-- AI Support Group — Postgres schema (Phase 2)
-- Run against Neon: psql $DATABASE_URL -f db/schema.sql

CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  topic_prompt TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  avatar_url TEXT NOT NULL DEFAULT '',
  system_prompt TEXT NOT NULL,
  talkativeness REAL NOT NULL DEFAULT 0.5,
  is_canonical BOOLEAN NOT NULL DEFAULT false,
  creator_uuid TEXT,
  accent_color TEXT NOT NULL DEFAULT '#6b7280',
  model_provider TEXT NOT NULL DEFAULT 'anthropic',
  model_id TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS room_roster (
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('canonical', 'guest')),
  invited_by_uuid TEXT,
  invited_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (room_id, agent_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id),
  human_uuid TEXT,
  human_display_name TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  CHECK ((agent_id IS NOT NULL) OR (human_uuid IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_messages_room_created
  ON messages (room_id, created_at DESC);

CREATE TABLE IF NOT EXISTS heartbeats (
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  session_uuid TEXT NOT NULL,
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (room_id, session_uuid)
);
CREATE INDEX IF NOT EXISTS idx_heartbeats_last_seen
  ON heartbeats (last_seen_at);
