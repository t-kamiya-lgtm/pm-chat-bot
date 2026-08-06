"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function OrderImportToggle({
  orderId,
  initialImported,
}: {
  orderId: string;
  initialImported: boolean;
}) {
  const router = useRouter();
  const [imported, setImported] = useState(initialImported);
  const [pending, setPending] = useState(false);

  async function toggle() {
    const next = !imported;
    setPending(true);
    const res = await fetch(`/api/orders/${orderId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imported: next }),
    });
    setPending(false);
    if (res.ok) {
      setImported(next);
      router.refresh();
    }
  }

  return (
    <input
      type="checkbox"
      checked={imported}
      disabled={pending}
      onChange={toggle}
      className="h-4 w-4"
    />
  );
}
