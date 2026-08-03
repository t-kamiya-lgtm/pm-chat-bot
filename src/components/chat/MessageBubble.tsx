import type { ChatMessage } from "@/components/chat/types";

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.from === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] overflow-hidden rounded-2xl text-sm ${
          isUser ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-900"
        }`}
      >
        {message.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={message.imageUrl} alt="" className="block h-auto w-full object-cover" />
        )}
        {message.text && <div className="px-4 py-2 whitespace-pre-wrap">{message.text}</div>}
      </div>
    </div>
  );
}
