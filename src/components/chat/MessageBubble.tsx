import type { ChatMessage } from "@/components/chat/types";

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.from === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${
          isUser ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-900"
        }`}
      >
        {message.text}
      </div>
    </div>
  );
}
