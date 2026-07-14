/** 全ルート共通のローディングスケルトン（キャッシュミス時の白画面を防ぐ）。 */
export default function Loading() {
  return (
    <main className="container" aria-busy="true" aria-label="読み込み中">
      <div className="skeleton" style={{ height: 30, width: 300, marginTop: 28 }} />
      <div className="skeleton" style={{ height: 14, width: 220, marginTop: 12 }} />
      <div className="skeleton" style={{ height: 40, marginTop: 24 }} />
      <div className="skeleton" style={{ height: 200, marginTop: 20 }} />
      <div className="skeleton" style={{ height: 200, marginTop: 16 }} />
      <div className="skeleton" style={{ height: 200, marginTop: 16 }} />
    </main>
  );
}
