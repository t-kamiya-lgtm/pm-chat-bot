import { Suspense } from "react";
import { ChatWidget } from "@/components/chat/ChatWidget";

export default function WidgetPage() {
  return (
    <div className="fixed inset-0 h-[100dvh] w-screen overflow-hidden">
      <Suspense>
        <ChatWidget />
      </Suspense>
    </div>
  );
}
