/** 銘柄詳細のローディングスケルトン（ヘッダー＋チャート＋指標グリッドの形）。 */
export default function Loading() {
  return (
    <main className="container" aria-busy="true" aria-label="読み込み中">
      <div className="skeleton" style={{ height: 30, width: 340, marginTop: 28 }} />
      <div className="skeleton" style={{ height: 14, width: 200, marginTop: 12 }} />
      <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton" style={{ height: 90, flex: 1 }} />
        ))}
      </div>
      <div className="skeleton" style={{ height: 360, marginTop: 20 }} />
      <div className="skeleton" style={{ height: 220, marginTop: 16 }} />
    </main>
  );
}
