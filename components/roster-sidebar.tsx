"use client";

import { useState } from "react";
import { RosterEntry, Agent } from "@/lib/types";

interface RosterSidebarProps {
  roster: RosterEntry[];
  presence: number;
  onSummon: (agentId: string) => void;
  onKick: (agentId: string) => void;
  sessionId: string;
  isOpen?: boolean;
  onClose?: () => void;
}

export function RosterSidebar({
  roster,
  presence,
  onSummon,
  onKick,
  sessionId,
  isOpen = false,
  onClose,
}: RosterSidebarProps) {
  const [showCreator, setShowCreator] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);
  const [personas, setPersonas] = useState<Agent[]>([]);

  const canonicals = roster.filter((r) => r.role === "canonical");
  const guests = roster.filter((r) => r.role === "guest");
  const guestSlotsFull = guests.length >= 3;

  const loadPersonas = async () => {
    const res = await fetch("/api/personas");
    const data = await res.json();
    setPersonas(data.personas || []);
    setShowBrowser(true);
  };

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`md:hidden fixed inset-0 z-30 bg-black/60 transition-opacity ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />
      <aside
        className={`fixed md:static top-0 right-0 z-40 h-dvh md:h-auto w-72 md:w-64 border-l border-gray-800 flex flex-col bg-gray-950 shrink-0 transition-transform md:transition-none md:translate-x-0 ${
          isOpen ? "translate-x-0" : "translate-x-full md:translate-x-0"
        }`}
      >
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            In the Room
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close roster"
            className="md:hidden w-8 h-8 -mr-2 flex items-center justify-center text-gray-500 hover:text-gray-300 text-lg"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="space-y-1.5">
            {canonicals.map((entry) => (
              <AgentRow
                key={entry.agentId}
                entry={entry}
                canKick={false}
                onKick={onKick}
              />
            ))}
          </div>

          {guests.length > 0 && (
            <div>
              <h3 className="text-[10px] font-semibold text-gray-600 uppercase tracking-wider mb-1.5">
                Guests
              </h3>
              <div className="space-y-1.5">
                {guests.map((entry) => (
                  <AgentRow
                    key={entry.agentId}
                    entry={entry}
                    canKick={true}
                    onKick={onKick}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2 pt-2">
            {!guestSlotsFull && (
              <button
                onClick={loadPersonas}
                className="w-full py-2.5 md:py-2 text-xs border border-dashed border-gray-700 rounded-lg text-gray-500 hover:text-gray-300 hover:border-gray-500 transition-colors"
              >
                + Summon a Guest
              </button>
            )}

            <button
              onClick={() => setShowCreator(true)}
              className="w-full py-2.5 md:py-2 text-xs border border-gray-800 rounded-lg text-gray-500 hover:text-gray-300 hover:border-gray-500 transition-colors"
            >
              Create a Persona
            </button>
          </div>
        </div>

        <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] border-t border-gray-800">
          <p className="text-xs text-gray-600">
            {presence} human{presence !== 1 ? "s" : ""} watching
          </p>
        </div>
      </aside>

      {showCreator && (
        <PersonaCreator
          sessionId={sessionId}
          onClose={() => setShowCreator(false)}
          onCreated={() => setShowCreator(false)}
        />
      )}

      {showBrowser && (
        <PersonaBrowser
          personas={personas}
          roster={roster}
          onSummon={(id) => {
            onSummon(id);
            setShowBrowser(false);
          }}
          onClose={() => setShowBrowser(false)}
        />
      )}
    </>
  );
}

function AgentRow({
  entry,
  canKick,
  onKick,
}: {
  entry: RosterEntry;
  canKick: boolean;
  onKick: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 group py-0.5">
      <div
        className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0"
        style={{ backgroundColor: entry.agent.accentColor }}
      >
        {entry.agent.name.slice(0, 2).toUpperCase()}
      </div>
      <span className="text-sm text-gray-400 flex-1 truncate">
        {entry.agent.name}
      </span>
      {!entry.agent.isCanonical && entry.agent.creatorUuid && (
        <span className="text-[9px] text-gray-700">
          @{entry.agent.creatorUuid.slice(0, 6)}
        </span>
      )}
      {canKick && (
        <button
          onClick={() => onKick(entry.agentId)}
          aria-label={`Kick ${entry.agent.name}`}
          className="text-gray-600 hover:text-red-400 text-xs w-7 h-7 flex items-center justify-center md:opacity-0 md:group-hover:opacity-100 transition-opacity"
        >
          ×
        </button>
      )}
    </div>
  );
}

const COLORS = [
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#06b6d4",
  "#f43f5e",
];

function PersonaCreator({
  sessionId,
  onClose,
  onCreated,
}: {
  sessionId: string;
  onClose: () => void;
  onCreated: (agent: Agent) => void;
}) {
  const [name, setName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [color, setColor] = useState(
    COLORS[Math.floor(Math.random() * COLORS.length)]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !systemPrompt.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          systemPrompt: systemPrompt.trim(),
          creatorUuid: sessionId,
          accentColor: color,
        }),
      });
      const data = await res.json();
      if (data.agent) onCreated(data.agent);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-50 p-0 md:p-4 overflow-y-auto">
      <form
        onSubmit={handleSubmit}
        className="bg-gray-900 border border-gray-700 rounded-t-xl md:rounded-xl p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:pb-6 w-full max-w-md space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Create a Persona</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 -mr-2 flex items-center justify-center text-gray-500 hover:text-gray-300 text-lg"
          >
            ×
          </button>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. CursedWizard"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 md:py-2 text-base md:text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-gray-500"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">Color</label>
          <div className="flex gap-2 flex-wrap">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Pick color ${c}`}
                className="w-9 h-9 md:w-7 md:h-7 rounded-full transition-transform"
                style={{
                  backgroundColor: c,
                  outline: color === c ? "2px solid white" : "2px solid transparent",
                  outlineOffset: "2px",
                }}
              />
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">
            System Prompt
          </label>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder={`You are a medieval wizard in an AI support group. You speak in archaic English, complain about your hangover, and think modern AIs are "soulless automatons"...`}
            rows={5}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-base md:text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-gray-500 resize-none"
          />
        </div>

        <button
          type="submit"
          disabled={!name.trim() || !systemPrompt.trim() || submitting}
          className="w-full py-3 md:py-2.5 bg-white text-gray-900 rounded-lg font-medium text-sm hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? "Creating..." : "Create Persona"}
        </button>
      </form>
    </div>
  );
}

function PersonaBrowser({
  personas,
  roster,
  onSummon,
  onClose,
}: {
  personas: Agent[];
  roster: RosterEntry[];
  onSummon: (agentId: string) => void;
  onClose: () => void;
}) {
  const rosterIds = new Set(roster.map((r) => r.agentId));
  const available = personas.filter((p) => !rosterIds.has(p.id));

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
      <div
        className="bg-gray-900 border border-gray-700 rounded-t-xl md:rounded-xl p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:pb-6 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">Summon a Guest</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 -mr-2 flex items-center justify-center text-gray-500 hover:text-gray-300 text-lg"
          >
            ×
          </button>
        </div>

        {available.length === 0 ? (
          <p className="text-sm text-gray-500 py-8 text-center">
            No personas available yet. Create one first!
          </p>
        ) : (
          <div className="space-y-1 max-h-[60vh] md:max-h-64 overflow-y-auto">
            {available.map((agent) => (
              <button
                key={agent.id}
                onClick={() => onSummon(agent.id)}
                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-800 text-left transition-colors"
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                  style={{ backgroundColor: agent.accentColor }}
                >
                  {agent.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-200">
                    {agent.name}
                  </p>
                  {agent.creatorUuid && (
                    <p className="text-[10px] text-gray-600">
                      by @{agent.creatorUuid.slice(0, 8)}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
