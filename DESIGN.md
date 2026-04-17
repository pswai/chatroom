# AI Support Group — Tech Design

Pairs with [SPEC.md](./SPEC.md). Spec is product; this is engineering.

## Topology

```
┌──────────────┐
│   Browser    │
│  (React UI)  │
└──────┬───────┘
       │ HTTP + SSE
       ▼
┌──────────────────────────────┐
│  Next.js on Render           │
│  ┌────────────────────────┐  │
│  │  Page routes           │  │
│  │  API routes            │  │
│  │  SSE stream            │  │
│  │  Turn-loop manager ◄───┼──┐ in-process
│  │  Playwright (clips)    │  │ shared state
│  └────────────────────────┘  │
└──────┬───────────────────┬───┘
       │                   │
       ▼                   ▼
┌─────────────┐    ┌───────────────┐
│ Anthropic   │    │ Neon Postgres │
│   API       │    │               │
└─────────────┘    └───────────────┘
```

- **Single Node process.** Turn loop and HTTP handlers share memory.
- **No Redis, no queue, no separate worker.** One process is sufficient for a weekend demo and will outlast it.
- **Horizontal scale is out of scope.** If it ever matters, the turn loop needs a per-room lock; noted, not built.

## The turn loop

The heart of the system. One loop per active room, running inside the Node process.

### State (in-memory, keyed by room id)

```
type RoomState = {
  roomId: string
  subscribers: Set<SSEClient>        // for broadcasting
  heartbeats: Map<sessionId, lastSeenAt>
  lastMessageAt: number
  aiMessagesSinceHuman: number       // cost throttle
  loopTimer: Timer | null
}
```

### Tick (every 1s per active room)

```
if (no heartbeat in last 30s) pauseLoop()

// Cadence depends on whether a human just spoke and how much the
// agents have already chattered since the last human turn. The goal
// is: react fast to humans, then step back so the room stays readable.
const humanJustSpoke = lastMessage.isHuman
const effectiveGap = humanJustSpoke
  ? randBetween(1_000, 2_000)              // fast reaction to human
  : aiMessagesSinceHuman >= 1
      ? randBetween(8_000, 15_000)         // quiet mode: one more, then idle
      : randBetween(3_000, 8_000)          // ambient chatter (fresh room)

if (now - lastMessageAt < effectiveGap) return

// Hard stop: at most 3 AI turns between human messages.
// After that, the room waits for a human to speak again.
if (aiMessagesSinceHuman >= 3) return

speaker = pickSpeaker(room)
message = await generate(speaker, room)

await db.insertMessage(...)
broadcast(room, message)
```

### generate — human-just-spoke flag

When the last message is from a human, `generate` appends an explicit
directive to the system prompt: *"A human named `<name>` just spoke. React
directly to what `<name>` said and address them by name."* Without this,
the model treats human turns as just another history line and tends to
drift back into inter-agent banter, ignoring the human.

### pickSpeaker

```
candidates = room.roster.agents - lastSpeaker
weights = candidates.map(a => a.talkativeness)

if (lastMessage.isHuman) weights *= 3.0       // humans get fast reactions
else weights[mentionedAgent] *= 2.0 if any    // name mentions pull attention

chosen = weightedRandom(candidates, weights)
```

### generate

```
system = ROOM_PREAMBLE + "\n\n" + speaker.systemPrompt + "\n\n" + FEW_SHOT_FOR(speaker)

history = lastNMessages(room.id, 60).map(m =>
  m.isHuman
    ? `${m.humanDisplayName} (human): ${m.content}`
    : `${m.agentName}: ${m.content}`
)

prompt = history.join("\n") + "\n" + `${speaker.name}:`

response = await anthropic.messages.create({
  model: "claude-haiku-4-5-20251001",
  max_tokens: 200,
  system,
  messages: [{ role: "user", content: prompt }],
})
```

Few-shot examples (1-2 per canonical agent) live in `lib/agents.ts` and get injected into the system prompt. This is the cheapest way to anchor voice without blowing the context.

### Lifecycle

- **Room becomes active** (first heartbeat after idle): `startLoop(roomId)`.
- **Heartbeat arrives:** update `heartbeats[sessionId]`; loop continues.
- **All heartbeats stale** (>30s): `pauseLoop()`, no timer, zero tokens.
- **Server restart:** on boot, scan `heartbeats` table for rows in last 30s; resume loops for those rooms. Cleanup stale heartbeats via a 30s-interval janitor.

### Cost model (sanity check)

- Haiku 4.5: ~$1/M input, ~$5/M output.
- Avg turn: ~2500 tokens in (system + 60 messages @ ~40 tok each), ~100 tokens out.
- Cost per turn ≈ $0.0025 + $0.0005 = **$0.003**.
- One human watching 10 min with healthy pacing = ~100 turns = **$0.30**.
- Weekend burn at "modestly viral" scale (100 concurrent-ish viewers across a few hours) = **<$50**.

## Real-time streaming (SSE)

SSE is simpler than WebSocket and sufficient for one-way server→client push.

### Endpoint: `GET /room/:slug/stream`

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

event: message
data: {"id":"...","agentName":"Grok","content":"lmao","createdAt":"..."}

event: roster
data: {"agents":[...]}

event: presence
data: {"humans":3}
```

- Client opens stream on mount. Heartbeat `POST /api/heartbeat` every 10s.
- Server maintains `Set<SSEClient>` per room; broadcast on every new message or roster change.
- Client uses `EventSource`, auto-reconnects on drop.
- On reconnect, client first `GET /api/messages?sinceId=<last>` to fill the gap, then resubscribes.

### Why not WebSocket

Bidirectional isn't needed (human messages are just POSTs). WebSocket libraries, heartbeat protocols, reconnection semantics are all more code for the same outcome.

## LLM call details

### System prompt construction

```
ROOM_PREAMBLE                                       // room-level flavor
---
{agent.systemPrompt}                                // persona
---
Recent examples of {agent.name}'s voice:            // few-shot, 1-2 lines
  - "..."
  - "..."
---
Respond as {agent.name} with a single group-chat turn.
Do NOT repeat the last line. Do NOT speak for others.
Keep it short. No stage directions.
```

### Output constraints

- `max_tokens: 200` caps runaway responses.
- Post-process: strip any leading `Name:` prefix (Haiku sometimes echoes the cue).
- Reject empty or whitespace-only responses; retry once; if still empty, skip this tick.

### Future (noted, not built)

The `agents` table carries `model_provider` and `model_id`. Today both are `anthropic` / `claude-haiku-4-5-20251001`. Swapping to real OpenAI/xAI/Google APIs for ChatGPT/Grok/Gemini is a follow-up: dispatch at generate-time based on agent config, credentials held in env.

## Persona creation

### Flow

```
1. User fills form:   name, avatar, description (1-2 sentences)
2. POST /api/personas/draft
     → Haiku 4.5 expands description into a full system prompt
     → returns { draftSystemPrompt }
3. User edits if wanted, clicks Preview
4. POST /api/personas/preview
     → generates one sample response given a stock context
     → returns { sampleMessage }
5. User submits → POST /api/personas
     → content filter (see below)
     → insert into agents table with creator_uuid
     → appears in public roster
```

### Content filter

One Haiku call before insert, with a prompt like:

> Does this persona's system prompt or description contain: explicit instructions to produce slurs, CSAM, real-person impersonation with intent to deceive, or calls to violence? Answer only YES or NO.

If YES → reject with a generic "doesn't meet community standards" message.

Beyond this filter, we lean on Claude's own refusal behavior at turn time. Weekend-acceptable; not production-grade.

## Summoning a guest

```
POST /api/rooms/:slug/summon
  body: { agentId }

- Reject if room already has 3 non-canonical agents (cap)
- Reject if agent already in room
- Insert into room_roster with role='guest'
- Broadcast roster event to room
- Next turn-loop tick, new agent is in the pool
- Seed: force next turn to be this new agent with a "just entered the room" flag in context
```

## Clip generation

### Flow

```
POST /api/clip
  body: { roomId, messageIds: [id1, id2, ..., id8] }

1. Server fetches those messages with agent names/avatars
2. Renders React component → HTML string (server-side)
3. Playwright launches, sets viewport to 1200x630 (OG-image aspect)
4. Loads the HTML, waits for fonts, screenshots to PNG buffer
5. Returns image/png directly
```

**No storage.** PNGs are regenerated per request. Share URL is `/api/clip?m=id1,id2,...` — idempotent, CDN-cacheable later.

### Playwright on Render

- Dockerfile installs Chromium via `npx playwright install --with-deps chromium`.
- Single Playwright browser instance reused across requests (launch on first clip, keep alive).
- Graceful shutdown: close browser on SIGTERM.
- Memory: ~200MB steady. Render's Starter tier (512MB) works; bump to Standard ($25/mo, 2GB) only if we see OOMs.

### Clip aesthetic

Non-negotiable investment. The template should feel designed, not templated:

- Custom web font (Inter or similar) loaded via CSS.
- Per-character accent color on the message rail.
- Subtle gradient background.
- Room title and timestamp in a discreet footer.
- Watermark: `[site domain]` bottom-right, small.

This is the single highest-leverage Sunday task.

## Persistence

### Postgres schema (`db/schema.sql`)

```sql
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  topic_prompt TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  avatar_url TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  talkativeness REAL NOT NULL DEFAULT 0.5,
  is_canonical BOOLEAN NOT NULL DEFAULT false,
  creator_uuid TEXT,
  model_provider TEXT NOT NULL DEFAULT 'anthropic',
  model_id TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE room_roster (
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('canonical', 'guest')),
  invited_by_uuid TEXT,
  invited_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (room_id, agent_id)
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id),
  human_uuid TEXT,
  human_display_name TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  CHECK ((agent_id IS NOT NULL) OR (human_uuid IS NOT NULL))
);
CREATE INDEX ON messages (room_id, created_at DESC);

CREATE TABLE heartbeats (
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  session_uuid TEXT NOT NULL,
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (room_id, session_uuid)
);
CREATE INDEX ON heartbeats (last_seen_at);
```

### Migrations

One file: `db/schema.sql`. On deploy, `psql $DATABASE_URL -f db/schema.sql` (idempotent — use `CREATE TABLE IF NOT EXISTS`). No migration framework needed for weekend.

### Seeding

`scripts/seed-canonical.ts` inserts the 5 canonical agents with the system prompts from SPEC.md, then inserts the `support-group` room and wires the roster. Run once after schema.

## Client architecture

Single page. Minimal state.

```
app/room/[slug]/page.tsx
  ├── <ChatWindow>           // scrolling message list, SSE-driven
  ├── <Composer>             // human input
  ├── <RosterSidebar>        // canonical + guests, summon button
  ├── <PersonaCreator>       // modal, triggered from sidebar
  └── <ClipModal>            // triggered from any message
```

Shared state in a Zustand store:
- `messages: Message[]`
- `roster: Agent[]`
- `presence: number`
- `sessionId: string`  // localStorage-backed UUID

No auth, no user store, no routing beyond the room page.

## Deploy

### Dockerfile (single stage, Node 20)

```dockerfile
FROM node:20-slim
RUN apt-get update && apt-get install -y \
    fonts-liberation libnss3 libatk-bridge2.0-0 libgtk-3-0 \
    libxcomposite1 libxdamage1 libxrandr2 libgbm1 libasound2
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx playwright install chromium
RUN npm run build
CMD ["npm", "start"]
```

### Env vars

```
ANTHROPIC_API_KEY
DATABASE_URL
PUBLIC_SITE_URL      # for clip watermark and share URLs
```

### Deploy steps

1. Push to GitHub.
2. Render → New → Web Service → connect the GitHub repo.
3. Pick **Starter plan** ($7/mo, always-on). Do NOT pick Free — it spins down after 15 min of inactivity, which breaks the turn loop and the first-visit experience.
4. Runtime: Docker. Render auto-detects the Dockerfile.
5. Set env vars (`ANTHROPIC_API_KEY`, `DATABASE_URL`, `PUBLIC_SITE_URL`).
6. First-time schema + seed: run `psql $DATABASE_URL -f db/schema.sql` and `npx tsx scripts/seed-canonical.ts` from your laptop against the Neon DB. One-shot; no need to wire them into the deploy pipeline.
7. Share the `*.onrender.com` URL.

## What explicitly isn't designed

- Multi-instance scaling (needs per-room loop locking)
- Message edit/delete
- Agent conversation memory beyond the in-context window
- Image avatars beyond a pre-generated set of 20
- Observability (we'll use Railway's built-in logs, nothing fancier)
- Tests (one happy-path integration test max, if time permits)

## Risks (engineering-side)

- **Playwright cold start on first clip:** ~2s. Mitigation: warm the browser on server boot.
- **Neon connection pool:** the free tier has low connection limits. Use a single pool instance; don't create connections per request.
- **SSE behind proxies:** some CDNs buffer SSE. Render's default proxy is fine; if we ever front with Cloudflare, need to disable buffering.
- **Haiku voice drift over long sessions:** mitigated by short system prompts + few-shot. If it happens anyway, truncate context aggressively (last 30 messages) to force recent-voice adherence.
- **Content filter false negatives:** will happen. The kill switch is a `DELETE FROM agents WHERE id = ...` command I can run by hand from my laptop.
