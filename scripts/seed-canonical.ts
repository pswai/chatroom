import { Pool } from "pg";
import { CANONICAL_AGENTS, ROOM_CONFIG, ROOM_PREAMBLE } from "../lib/agents";

async function seed() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url });

  try {
    await pool.query(
      `INSERT INTO rooms (id, slug, title, topic_prompt)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (slug) DO NOTHING`,
      [ROOM_CONFIG.id, ROOM_CONFIG.slug, ROOM_CONFIG.title, ROOM_PREAMBLE]
    );

    for (const agent of CANONICAL_AGENTS) {
      await pool.query(
        `INSERT INTO agents (id, name, avatar_url, system_prompt, talkativeness, is_canonical, accent_color)
         VALUES ($1, $2, $3, $4, $5, true, $6)
         ON CONFLICT (id) DO NOTHING`,
        [
          agent.id,
          agent.name,
          agent.avatarUrl,
          agent.systemPrompt,
          agent.talkativeness,
          agent.accentColor,
        ]
      );

      await pool.query(
        `INSERT INTO room_roster (room_id, agent_id, role)
         VALUES ($1, $2, 'canonical')
         ON CONFLICT DO NOTHING`,
        [ROOM_CONFIG.id, agent.id]
      );
    }

    console.log("Seed complete: room + 5 canonical agents");
  } catch (err) {
    console.error("Seed error:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
