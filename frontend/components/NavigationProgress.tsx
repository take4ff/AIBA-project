"use client";

/**
 * NavigationProgress — ページ遷移中に画面上部へ細いプログレスバーを表示。
 *
 * 仕組み：
 * 1. document の click イベントで同一オリジンの <a> リンクを検知 → バー開始
 * 2. usePathname() の変化を検知 → バーを 100% に伸ばしてフェードアウト
 *
 * 現ページのコンテンツはそのまま残り、バーだけが画面最上部に重なる。
 */

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export default function NavigationProgress() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedRef = useRef(false); // クリック後に実際にナビが始まったか

  /* ── リンククリックでバーを開始 ──────────────────────────── */
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
      if (!a) return;

      const href = a.getAttribute("href") ?? "";
      // ハッシュ・外部・mailto・target=_blank は無視
      if (
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        a.target === "_blank"
      ) return;

      try {
        const url = new URL(href, location.href);
        if (url.origin !== location.origin) return;
        if (url.pathname === pathname) return; // 同じページは無視
      } catch {
        return;
      }

      // バー開始
      if (intervalRef.current) clearInterval(intervalRef.current);
      startedRef.current = true;
      setVisible(true);
      setWidth(15);

      // 進行をゆっくり 85% まで伸ばし続ける（非線形で自然に）
      intervalRef.current = setInterval(() => {
        setWidth((w) => {
          if (w >= 85) {
            clearInterval(intervalRef.current!);
            return 85;
          }
          return w + (85 - w) * 0.12;
        });
      }, 120);
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [pathname]);

  /* ── pathname 変化（ナビ完了）でバーを完了 ───────────────── */
  useEffect(() => {
    if (!startedRef.current) return;
    startedRef.current = false;
    if (intervalRef.current) clearInterval(intervalRef.current);

    // 100% へ伸ばす
    setWidth(100);
    // 少し待ってからフェードアウト
    const t = setTimeout(() => {
      setVisible(false);
      setTimeout(() => setWidth(0), 300); // フェード後にリセット
    }, 250);
    return () => clearTimeout(t);
  }, [pathname]);

  return (
    <div
      aria-hidden
      className="nav-progress"
      style={{
        width: `${width}%`,
        opacity: visible ? 1 : 0,
        transition: visible
          ? width >= 100
            ? "width 0.25s ease, opacity 0.3s ease 0.15s"
            : "width 0.4s ease"
          : "opacity 0.3s ease",
      }}
    />
  );
}
