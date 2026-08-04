import { Suspense } from "react";
import { ChatWidget } from "@/components/chat/ChatWidget";

export default function WidgetPage() {
  return (
    <div className="h-[100dvh] w-screen">
      <Suspense>
        <ChatWidget />
      </Suspense>
    </div>
  );
}
