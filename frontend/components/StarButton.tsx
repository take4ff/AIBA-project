"use client";

import { useAuth } from "@/components/AuthProvider";

export default function StarButton({ domainId }: { domainId: string }) {
  const { isWatched, toggleWatch } = useAuth();
  const on = isWatched(domainId);
  return (
    <button
      type="button"
      className={`star-btn${on ? " star-on" : ""}`}
      title={on ? "お気に入りから外す" : "お気に入りに追加"}
      aria-label="お気に入り"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleWatch(domainId);
      }}
    >
      {on ? "★" : "☆"}
    </button>
  );
}
