"use client";

const SECTIONS = [
  { id: "momentum",     label: "順張りおすすめ" },
  { id: "future-gafam", label: "未来のGAFAM候補" },
  { id: "golden-cross", label: "ゴールデンクロス" },
] as const;

export default function TopicNav() {
  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <nav className="topic-nav">
      {SECTIONS.map((s) => (
        <button key={s.id} className="topic-nav-btn" onClick={() => scrollTo(s.id)}>
          {s.label}
        </button>
      ))}
    </nav>
  );
}
