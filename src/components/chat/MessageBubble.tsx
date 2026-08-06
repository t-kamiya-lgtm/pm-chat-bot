import type { ChatMessage } from "@/components/chat/types";

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.from === "user";
  const image = message.imageUrl && (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={message.imageUrl} alt="" className="block h-auto w-full object-cover" />
  );

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className="max-w-[80%] overflow-hidden rounded-2xl text-sm"
        style={{
          backgroundColor: isUser ? "var(--user-message-bg, #171717)" : "var(--message-bg, #f5f5f4)",
          color: isUser ? "var(--user-message-fg, white)" : "var(--message-fg, black)",
        }}
      >
        {image &&
          (message.linkUrl ? (
            <a href={message.linkUrl} target="_blank" rel="noopener noreferrer">
              {image}
            </a>
          ) : (
            image
          ))}
        {message.text && <div className="px-4 py-2 whitespace-pre-wrap">{message.text}</div>}
      </div>
    </div>
  );
}
