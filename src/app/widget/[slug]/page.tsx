import { Suspense } from "react";
import { ChatWidget } from "@/components/chat/ChatWidget";

export default async function WidgetScenarioPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return (
    <div className="h-[100dvh] w-screen">
      <Suspense>
        <ChatWidget scenarioSlug={slug} />
      </Suspense>
    </div>
  );
}
