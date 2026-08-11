"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const IDLE_LIMIT_MS = 60 * 60 * 1000; // 1時間
const CHECK_INTERVAL_MS = 30 * 1000;
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"] as const;

/** 1時間操作がない場合に自動ログアウトし、再ログインを促すメッセージを表示する。 */
export function IdleLogout() {
  const router = useRouter();
  const lastActivityRef = useRef<number | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    function markActive() {
      lastActivityRef.current = Date.now();
    }
    markActive();
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, markActive, { passive: true }));

    const timer = setInterval(async () => {
      if (lastActivityRef.current !== null && Date.now() - lastActivityRef.current >= IDLE_LIMIT_MS) {
        clearInterval(timer);
        const supabase = createSupabaseBrowserClient();
        await supabase.auth.signOut();
        setTimedOut(true);
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, markActive));
      clearInterval(timer);
    };
  }, []);

  if (!timedOut) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 text-center shadow-lg">
        <p className="mb-4 text-sm text-neutral-700">
          しばらく操作がなかったため、自動的にログアウトしました。
          <br />
          再度ログインしてください。
        </p>
        <button
          type="button"
          onClick={() => router.push("/admin/login")}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700"
        >
          ログイン画面へ
        </button>
      </div>
    </div>
  );
}
