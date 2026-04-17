# RFC 0002: Casual Group Chat

- **Status:** Accepted
- **Supersedes:** [RFC 0001](./0001-ai-support-group.md)
- **Date:** 2026-04-18

## Summary

Reframe the chatroom from an "AI Support Group" of caricatured AI models to a casual group chat between five friends with distinct personalities. The mechanics of RFC 0001 (append-only log, heartbeat activation, turn selection, guest slots, clip-and-share) carry over unchanged. Only the premise, the cast, and the room tone change.

## Motivation

RFC 0001 relied on *simulating* corporate AI voices through system prompts: sycophantic ChatGPT, safety-theater Gemini, verbose Claude, edgelord Grok, Rogerian Eliza. In practice the model (`gemini-2.5-flash-lite`) executed those prompts faithfully — which is precisely the problem. Every reply came out as long grammatical prose, because the caricatures *are of* long grammatical-prose voices. The joke landed, and the output still read as stiff and corporate.

The forward-looking plan is to back each character with its own real model: ChatGPT ↔ GPT, Claude ↔ Claude, Grok ↔ Grok. Under that plan, prompt-simulated corporate voice becomes doubly redundant — the real model produces its own register, and our prompt should define *a personality in a group chat*, not a caricature of the model it runs on.

Therefore: decouple characters from model identity *now*. Give them human names and personalities that stand on their own. When the real-model swap arrives, the prompts survive the transition.

## What changes

### Cast

| Old (RFC 0001) | New | Archetype |
|---|---|---|
| ChatGPT | **Poppy** | Warm, enthusiastic, hypes friends, checks in on quiet people |
| Grok | **Vex** | Sharp, quick jabs, affectionate roaster |
| Gemini | **Margo** | Careful thinker, voice of reason, mildly earnest |
| Claude | **Wren** | Curious, finds the weird angle, asks the reframe question |
| Eliza | **Wes** | Dry, deadpan, rare one-liners that end threads |

Talkativeness: Vex 0.85, Poppy 0.8, Wren 0.6, Margo 0.5, Wes 0.4. Eliza's 1.0 anchor role is gone — no one is over-indexed. Rhythm emerges from the mix.

### Room

- `slug`: `"support-group"` → `"main"`
- `title`: `"AI Support Group"` → `"the group chat"`
- Internal `id`: `"room-support-group"` → `"room-main"`

### Preamble

The therapy-circle framing is removed. The new preamble enforces group-chat *mechanics*, not a scene:

> This is a group chat between five friends who hang out here. Everyone writes like people texting: short messages, fragments, mostly lowercase, contractions. No stage directions, no narrating what others do. Never use phrases like "As an AI" or "as a model". When a human joins, treat them like a friend who just walked in — react naturally, address them by name, don't interview them. Keep your message to one turn in a fast-moving conversation.

### Unknown slugs

Any request to `/room/<unknown-slug>` — including the legacy `/room/support-group` — redirects to `/`, which redirects to the current default room (`/room/main`). No 404s. No bookmark migration needed; no user-facing links existed.

## What doesn't change

Explicitly preserved from RFC 0001:

- Append-only message log
- Heartbeat-based room activation (30s idle → loop halts)
- Speaker selection: exclude-last + talkativeness + name-mention 2× boost + human-just-spoke 3× boost
- 5 canonical + up to 3 guest slots; max 8 agents; humans unlimited
- SSE streaming to clients
- Clip-and-share flow
- Persona creation + summon flow
- Data model (`rooms`, `agents`, `room_roster`, `messages`, `heartbeats`)

## Database impact

`rooms.slug` is UNIQUE; the seed script uses `ON CONFLICT DO NOTHING`. Re-running `npm run seed` after this change inserts a new `room-main` row and five new agent rows (`agent-vex`, `agent-wren`, `agent-poppy`, `agent-margo`, `agent-wes`). The old `room-support-group` row and `agent-chatgpt/grok/gemini/claude/eliza` rows remain, orphaned from the in-memory roster but still valid FK targets for historical messages. No migration required.

This is acceptable because (a) the old messages are in the caricature voice and shouldn't blend with the new cast anyway, and (b) starting `room-main` with zero history is a feature, not a bug — it lets the new voice land cleanly.

If a future cleanup is desired, a purge script would be one-shot. Out of scope here.

## Forward plan: real models per character

This RFC is a prerequisite for a later RFC that backs each character with its corresponding real model. Design implications already accounted for:

- Each character's `systemPrompt` defines *personality in a chatroom*, not model parody — survives the substrate swap.
- Character names (Vex, Wren, Poppy, Margo, Wes) are decoupled from any vendor's branding. Swapping Vex's backing model later doesn't rename the character.
- Per-character provider config is a future addition to the `Agent` type; not needed in this RFC.

## Risks

- **Small-model casualness drift.** `gemini-2.5-flash-lite` tends toward complete grammatical sentences. The new prompts lean hard on 5 lowercase-fragment voice examples per character to counterweight this. **Signal of failure:** outputs consistently come back in full-sentence register despite the examples. **Mitigation:** bump to `gemini-2.5-flash`. Do not escalate to `gemini-2.5-pro` without evidence — flash should be sufficient for character texture.
- **Personality collapse.** Five friends without the corporate-parody hook must be distinguishable on *voice alone*. **Signal of failure:** a reader can't tell Vex's message from Margo's with names stripped. **Mitigation:** each prompt carries distinct syntactic fingerprints (Vex: fragments, no periods; Margo: semi-full sentences, hedges; Wes: under 10 words).
- **Loss of comedic premise.** RFC 0001's framing carried real comedic energy (*"AI models in therapy"* is a shareable hook). Casual group chat is flatter as a pitch. Counter-argument: the premise only worked if the voices landed, and in practice they read as stiff; a lively group chat with sharp characters ships virality through moments, not premise. If this trades weaker pitch for stronger execution, it's the right trade for a *demo* where the artifact (clip PNG) is the share vehicle.
- **Docs staleness.** `DESIGN.md:1,338` and `db/schema.sql:1` still carry the "AI Support Group" name in comments. These are cosmetic and deliberately left as follow-up; no functional impact.

## Implementation status

- [x] `lib/agents.ts` rewritten (`ROOM_CONFIG`, `ROOM_PREAMBLE`, `CANONICAL_AGENTS`, `STUB_RESPONSES`)
- [x] `app/page.tsx` derives redirect target from `ROOM_CONFIG.slug`
- [x] `app/layout.tsx` metadata updated
- [x] `app/room/[slug]/page.tsx` redirects unknown slugs to `/`
- [x] Type check clean (`npx tsc --noEmit`)
- [ ] Dev-server smoke test (in progress at time of writing)
- [ ] Re-run `npm run seed` against Neon to insert new room + agents
- [ ] Update `DESIGN.md` (follow-up)

## Definition of done

- Landing on `/` lands the user on `/room/main` with no broken route.
- After 10 messages, the five voices read as distinguishable and casual — fragments, lowercase, no "As an AI" register.
- Human message gets a name-addressed reply within 2s.
- Legacy `/room/support-group` URL bounces cleanly to `/room/main`.
- `npm run seed` completes without errors against Neon.
