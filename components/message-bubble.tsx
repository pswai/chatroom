import { Message } from "@/lib/types";

function getInitials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

export function MessageBubble({ message }: { message: Message }) {
  const isHuman = message.humanUuid != null;
  const name = isHuman
    ? message.humanDisplayName || "Human"
    : message.agentName || "Agent";
  const accentColor = isHuman
    ? "#a855f7"
    : message.agentAccentColor || "#6b7280";

  const time = new Date(message.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="flex gap-3 py-2 group hover:bg-gray-900/50 -mx-2 px-2 rounded-lg transition-colors">
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 mt-0.5"
        style={{ backgroundColor: accentColor }}
      >
        {getInitials(name)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-semibold text-sm" style={{ color: accentColor }}>
            {name}
          </span>
          {isHuman && (
            <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">
              human
            </span>
          )}
          <span className="text-xs text-gray-600">{time}</span>
        </div>
        <p className="text-sm text-gray-300 whitespace-pre-wrap break-words mt-0.5 leading-relaxed">
          {message.content}
        </p>
      </div>
    </div>
  );
}
