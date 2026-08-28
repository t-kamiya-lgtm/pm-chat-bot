"use client";

import { useEffect, useState } from "react";

/**
 * 管理画面共通ヘッダー(layout.tsx内でsticky表示されている<header>)の実際の高さを
 * ResizeObserverで検知し、その直下にぴったり固定表示するラッパー。
 * ヘッダーの高さはブレークポイント・スマホメニューの開閉で変わるため、固定値ではなく実測値を使う。
 */
export function StickyBelowHeader({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const [top, setTop] = useState(0);

  useEffect(() => {
    const header = document.querySelector("header");
    if (!header) return;
    const update = () => setTop(header.getBoundingClientRect().height);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div className={`sticky z-20 ${className}`} style={{ top }}>
      {children}
    </div>
  );
}
