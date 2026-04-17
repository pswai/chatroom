# Deployment

## Target

- **Host:** [Render](https://render.com) — auto-deploys from `main` branch of `github.com/pswai/chatroom`.
- **Database:** [Neon](https://neon.tech) Postgres. Connection string lives in the Render service's `DATABASE_URL` env var.
- **Build:** Docker (see `Dockerfile`). Render builds the image on every push to `main`.
- **Typical build + swap time:** ~3 minutes.

## Standard deploy

```bash
git push origin main
```

That's the whole thing. Monitor the build at Render dashboard → `chatroom` service → **Events**.

## Required env vars on Render

| Name | Purpose |
|---|---|
| `DATABASE_URL` | Neon pooler connection string |
| `GOOGLE_AI_API_KEY` | Google AI Studio key for Gemini |
| `AI_PROVIDER` | `google` — switches the agent loop from stub to live Gemini |

Set these in Render dashboard → service → **Environment**. The same three vars exist in local `.env` for dev.

## Database operations

Scripts in `scripts/` read `DATABASE_URL` from env. To run them against **prod** from a local checkout, source the local `.env` (which contains prod credentials for this weekend-demo setup) before invoking.

### Seed only (safe — idempotent)

`scripts/seed-canonical.ts` uses `ON CONFLICT DO NOTHING`, so running it twice is a no-op.

```bash
set -a && source .env && set +a
npm run seed
```

Use this when:
- First deploy to a fresh DB
- You've added a brand-new canonical agent (the seed will insert it without touching existing rows)

**Caveat:** it does NOT update existing rows. If you change an existing agent's `system_prompt` or `talkativeness` in `lib/agents.ts`, the DB stays stale. This is usually fine — the runtime reads the in-memory `CANONICAL_AGENTS` from code, not the DB — but persistence-side fields like `system_prompt` will drift until you wipe and re-seed.

### Wipe + re-seed (destructive)

Drops every table and re-creates them from `db/schema.sql`, then re-seeds.

```bash
set -a && source .env && set +a

npx tsx -e "
import { readFileSync } from 'fs';
import { Pool } from 'pg';
(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(readFileSync('db/schema.sql', 'utf-8'));
  await pool.end();
})();
"

npm run seed
```

Use this when:
- `db/schema.sql` changes (column added, constraint changed, etc.)
- The canonical cast changes IDs or the room slug changes, and you want orphan rows gone
- You want a clean demo before a presentation

**This deletes every message and every user-created persona.** No point-in-time restore is included in this flow — if you need one, use Neon dashboard's restore feature before running the wipe.

### Order relative to deploy

If your code change and DB change are coupled (e.g. renaming canonical agent IDs), push **first**, let Render finish building, then wipe + re-seed. The new container should boot against the fresh schema.

If they're not coupled, the order doesn't matter — but don't wipe while the old container is still serving traffic: any in-flight message insert will FK-fail.

## Rollback

```bash
git revert <bad-sha>
git push origin main
```

Render rebuilds the revert. ~3 minutes.

For DB rollback: use Neon's point-in-time restore from their dashboard. No local tooling for it.

## Post-deploy smoke test

1. Open the production URL.
2. Confirm the roster shows Vex / Wren / Poppy / Margo / Wes.
3. Send a human message; confirm a reply arrives within ~2s addressing you by name.
4. Switch topics mid-conversation; confirm the next AI reply picks up the new topic (this validates the abort-on-human-speak wiring).
