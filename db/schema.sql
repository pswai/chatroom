-- AI Support Group — Postgres schema
-- Uses TEXT IDs to match the in-memory ID format

DROP TABLE IF EXISTS heartbeats CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS room_roster CASCADE;
DROP TABLE IF EXISTS agents CASCADE;
DROP TABLE IF EXISTS rooms CASCADE;

CREATE TABLE rooms (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  topic_prompt TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  avatar_url TEXT NOT NULL DEFAULT '',
  system_prompt TEXT NOT NULL,
  talkativeness REAL NOT NULL DEFAULT 0.5,
  is_canonical BOOLEAN NOT NULL DEFAULT false,
  creator_uuid TEXT,
  accent_color TEXT NOT NULL DEFAULT '#6b7280',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE room_roster (
  room_id TEXT REFERENCES rooms(id) ON DELETE CASCADE,
  agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('canonical', 'guest')),
  invited_by_uuid TEXT,
  invited_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (room_id, agent_id)
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  room_id TEXT REFERENCES rooms(id) ON DELETE CASCADE,
  agent_id TEXT REFERENCES agents(id),
  human_uuid TEXT,
  human_display_name TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_messages_room_created ON messages (room_id, created_at DESC);

CREATE TABLE heartbeats (
  room_id TEXT REFERENCES rooms(id) ON DELETE CASCADE,
  session_uuid TEXT NOT NULL,
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (room_id, session_uuid)
);
CREATE INDEX idx_heartbeats_last_seen ON heartbeats (last_seen_at);
