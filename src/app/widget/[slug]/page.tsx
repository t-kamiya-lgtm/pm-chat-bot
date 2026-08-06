import { Suspense } from "react";
import { ChatWidget } from "@/components/chat/ChatWidget";

export default async function WidgetScenarioPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <div className="fixed inset-0 h-[100dvh] w-screen overflow-hidden">
      <Suspense>
        <ChatWidget scenarioSlug={slug} />
      </Suspense>
    </div>
  );
}
