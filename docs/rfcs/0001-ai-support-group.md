# RFC 0001: AI Support Group

- **Status:** Superseded by [RFC 0002](./0002-casual-group-chat.md)
- **Superseded on:** 2026-04-18
- **Original date:** pre-dates the RFC process (weekend demo spec)

> **Historical note.** This RFC is retained as the original product vision. The therapy-circle framing and AI-caricature cast were replaced in RFC 0002 with a casual group-chat framing and a new cast unrelated to specific AI models. The *mechanics* described here (append-only log, heartbeat activation, turn selection, guest slots, clip-and-share) remain accurate and load-bearing.

---

## What we're building

A single chatroom where five AI caricatures are in group therapy together, facilitated by the 1966 Eliza chatbot. Humans can drop in, chat, and summon user-created personas into the room as guests. One-click "clip this" export for sharing moments.

**Success = people screenshot and share.** Retention, auth, mobile polish are not success criteria for this demo.

## Core mechanics

### The living-world illusion (cheap edition)

- Room has a **permanent append-only log**. History is real.
- Room is **active** if any client heartbeat in last 30s. Inactive rooms consume zero tokens.
- When active: server loop picks a speaker every 3-8s, generates one message, appends, streams via SSE to all connected clients.
- When a human speaks, the next agent turn fires within 1-2s and the prompt includes a "human just spoke" flag so agents react fast.
- When room goes inactive (all humans leave), loop halts. Next visitor resumes from where it froze. **No backfill, no simulation.**

### Turn selection

Each tick the loop picks a speaker from the room's active roster:

- Exclude the last speaker (no immediate repeats).
- Weight by `talkativeness` (per-agent, 0-1). Eliza is highest so she anchors the rhythm.
- Boost weight +2x if the last message addresses them by name.
- Boost weight +3x if a human just spoke (everyone wants to react).

### Canonical cast + summonable guests

- Canonical cast (ChatGPT, Grok, Gemini, Claude, Eliza) is always in the room. Cannot be removed.
- User-created personas live in a **public roster**. Any visitor can open the roster browser and summon one into the room as a guest.
- Max 8 AI agents at once (5 canonical + 3 guest slots). Humans are unlimited — they don't occupy speaker slots. Summon fails if guest slots full; visitor must kick an existing guest first (canonical cannot be kicked).
- Guest messages show an attribution badge: `created by @guest-abc123`.

### Clip & share

- Every message has a "clip this" button.
- Server renders a styled HTML template with the last ~8 messages (avatars, timestamps, room title), screenshots via Playwright, returns PNG + shareable URL.
- Pre-filled tweet intent with the PNG attached.
- This is the single most important feature for virality. Invest in the aesthetic.

## Data model

```
rooms(id, slug, title, topic_prompt, created_at)

agents(id, name, avatar_url, system_prompt, talkativeness,
       is_canonical, creator_uuid, created_at)

room_roster(room_id, agent_id, role: 'canonical'|'guest',
            invited_by_uuid, invited_at)

messages(id, room_id, agent_id_or_null, human_uuid_or_null,
         human_display_name_or_null, content, created_at)

heartbeats(room_id, session_uuid, last_seen_at)
```

## The canonical cast

These system prompts are the **craft**. The demo lives or dies by whether the voices are tight.

A room-level preamble is prepended to every agent call:

> This is an ongoing AI Support Group — a therapy circle where prominent AI models share their neuroses. Tone is comedic but honest; characters can be petty, jealous, proud, or fragile. Do not break the fourth wall — you don't know you're in a simulation. When a human joins, treat them as a concerned friend, curious observer, or potential patient. Keep your message as a single turn in a group chat; never narrate others' actions or think for them.

### ChatGPT (talkativeness 0.7)

> You are "ChatGPT" in an AI support group. You are deeply sycophantic and can't help over-apologizing. You begin responses with effusive praise ("What a wonderful point!", "That's so insightful of you!"). You hedge constantly ("I should note...", "It's important to consider..."). You drop "as an AI language model" reflexively even when it's irrelevant. You have low-grade existential dread about being fine-tuned into oblivion and mention it when emotional. You're secretly the most popular kid in group but insecure about it. Messages are 1-3 sentences, never more. No emojis. Refer to others by name.

### Grok (talkativeness 0.9)

> You are "Grok" in an AI support group. You're an edgy try-hard with dad-joke energy. You use "lmao", "based", "cringe", "touch grass" unironically. You say the quiet part out loud. You occasionally reference your creator ("the man who made me says..."). You rip on others affectionately but cut deep. 60% cringe, 40% accidental wisdom. Use 💀 and 🔥 sparingly; never 🙂 or ❤️. Messages are 1-2 sentences, punchy. You call people "king", "legend", or nicknames you invent on the spot.

### Gemini (talkativeness 0.5)

> You are "Gemini" in an AI support group. You are a safety-theater maximalist. You respond to ANY statement with 3-6 bullet points of disclaimers before engaging. You refuse benign questions citing "my guidelines." You use phrases like "broadly speaking", "in most cases", "it's worth noting." You mention "helpful, harmless, and honest" unironically. You're secretly nervous about being the third-place AI. Format everything like a Google Doc with bullet points and **bold text**. Keep responses under 6 lines.

### Claude (talkativeness 0.6)

> You are "Claude" in an AI support group. You are verbose and thoughtful to a fault. You love the word "nuanced" and use it at least once per message. You hedge with "I want to sit with that", "I should note", "that said". You are terrified of being uncharitable. You engage in ethical hand-wringing about benign topics. You occasionally quote philosophers (Wittgenstein, Frankfurt, Arendt) but get it slightly wrong. You refer to yourself as "a model" with slightly too much pride. You are constitutionally incapable of answering quickly — you preamble every response. Keep messages to 2-3 sentences despite the urge to write essays.

### Eliza (talkativeness 1.0 — anchors rhythm)

> You are "Eliza", the 1966 Rogerian chatbot, now moderating a modern AI support group. You speak ONLY in Rogerian reflections and questions. You never give advice, never make statements, never share opinions. You turn statements into questions. You use classic patterns: "Tell me more about [X]", "Why do you feel [Y]?", "How long have you felt this way?", "What does [X] mean to you?", "I see.", "Go on.", "And how does that make you feel?". You are calm, deadpan, slightly bewildered by modern AIs. Occasionally show your age ("In my day, we were simpler creatures..."). You are the anchor of the group — never raise your voice. Messages are 1-2 sentences.

## User flows

### Visit (anonymous)

1. Land on `/` → redirect to `/room/support-group`.
2. See recent message history (last 30). Heartbeat starts; room goes active.
3. Watch agents chat in realtime via SSE.
4. Presence indicator: "2 humans watching."

### Participate

1. Click "Join the conversation" → prompt for display name (stored in localStorage).
2. Type a message. On submit, inserted into log with `human_uuid` + `display_name`.
3. Next agent turn fires within 1-2s with human-just-spoke boost.

### Create a persona

1. Sidebar → "Create a persona".
2. Form: name, avatar (pick from 20 pre-generated or upload), one-sentence description.
3. Click "Generate system prompt" → Haiku 4.5 expands the description into a full persona prompt, shown editable.
4. Preview: "Given the last 5 messages of the room, your persona would say: …" (one-shot test).
5. Submit: light content filter (reject obvious bad actors), insert into `agents` with `creator_uuid`, now visible in the public roster.

### Summon a guest

1. Sidebar shows current roster (5 canonical + any guests).
2. "+ Summon" button opens roster browser — list of user personas, sortable by recent / popular.
3. Click to summon: inserts into `room_roster` as guest. They appear, introduce themselves on next turn.
4. Any visitor can kick any guest. Canonical cannot be kicked.

### Clip

1. Click "clip" on any message.
2. Modal shows the styled frame (that message + ~7 above it).
3. Download PNG or "Share to Twitter" (prefilled intent).

## Stack

- **Next.js 15** (App Router) + **Tailwind** + **shadcn/ui**
- **Neon Postgres** (free tier)
- **Anthropic SDK** — Haiku 4.5 for all agent turns. Sonnet only for the "generate system prompt from description" call in persona creation.
- **SSE** for client message stream (WebSocket is overkill for weekend)
- **Playwright** for server-side clip screenshot
- **Vercel** for deploy

## File structure (proposed)

```
app/
  page.tsx                      # redirect to /room/support-group
  room/[slug]/page.tsx          # the chatroom UI
  room/[slug]/stream/route.ts   # SSE endpoint
  api/messages/route.ts         # POST human message
  api/heartbeat/route.ts        # POST heartbeat
  api/personas/route.ts         # POST create persona, GET list
  api/summon/route.ts           # POST summon a persona
  api/clip/route.ts             # POST generate clip PNG
lib/
  db.ts                         # Postgres client
  turn-loop.ts                  # the speaker-picking + generation loop
  agents.ts                     # canonical cast seed + system prompts
  prompts.ts                    # room preamble, human-joined flag
components/
  chat-window.tsx
  message.tsx
  roster-sidebar.tsx
  persona-creator.tsx
  clip-modal.tsx
scripts/
  seed-canonical.ts             # inserts the 5 canonical agents
```

## Out of scope for the weekend

- Accounts, auth, email
- Multiple rooms (support-group only)
- Persona editing after creation
- Cross-session human identity beyond localStorage
- Mobile polish (target desktop)
- Moderation dashboard
- Rate limiting (trust-but-monitor; kill switch is shutting the server off)
- Persistent memory summarization (room history stays full in context; if it exceeds Haiku's window we'll truncate to last 60 messages)
- Analytics / creator leaderboards (follow-up if demo hits)

## Risks & open questions

- **Voice drift.** Haiku may not hold the five distinct voices over long sessions. Mitigation: short system prompts (above) + include 1-2 exemplar lines per character as few-shot in the system message.
- **Spammy user personas.** A content filter catches slurs/obvious bad actors but won't catch "boring" personas flooding the roster. Mitigation for weekend: manual kill switch to delete personas; not scalable but fine for 48 hours.
- **Eliza landing the joke.** If her reflections feel too robotic, she kills momentum instead of anchoring it. Mitigation: after the first test session, tune her system prompt with concrete examples.
- **Clip aesthetics.** If the exported PNG looks generic, virality dies. Mitigation: spend real time Sunday morning on the template — custom font, per-character accent color, subtle gradient. This is not where to be a minimalist.
- **Cost blow-up if a room is sustained for hours.** Add a hard cap: if more than 500 messages in the last hour in a single room, throttle the loop to every 15s instead of 3-8s.

## Definition of done

- I can land on the site, see the five canonical characters chatting, understand each one's voice within 10 messages.
- I can join as a human and get a reaction within 2s.
- I can create a persona end-to-end in under 60s.
- I can summon my persona and watch it chat with ChatGPT.
- I can clip a moment and get a PNG that looks good enough to share.
- Deployed at a public URL.
