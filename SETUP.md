# AIBA セットアップ・運用ガイド

技術投資分析システム AIBA の構築・運用手順。リポジトリ構成と各Phaseの実行方法をまとめる。

## リポジトリ構成

```
AIBA-project/
├── config/targets.yaml        # 監視対象（3層×ティッカー＋センチメント用キーワード）
├── db/schema.sql              # Supabase スキーマ（テーブル/ビュー/RLS）
├── backend/                   # Phase 1: データ収集・スコア計算・DB投入
│   ├── aiba/                  #   コアパッケージ
│   │   ├── config.py          #   設定・targets.yaml ローダ
│   │   ├── technical.py       #   yfinance: RSI(14)・移動平均乖離率
│   │   ├── sentiment.py       #   GitHub / arXiv の熱量増加率
│   │   ├── score.py           #   AIBAスコア v1.1（層別重み＋RSIペナルティ）
│   │   ├── db.py              #   Supabase upsert（未設定時はローカルJSON）
│   │   └── pipeline.py        #   日次パイプライン本体
│   ├── run_daily.py           #   バッチのエントリポイント
│   └── requirements.txt
├── frontend/                  # Phase 3: Next.js ダッシュボード
└── .github/workflows/daily.yml # Phase 1: 日次自動実行（cron）
```

## キーの使い分け（重要）

| 用途 | キー | 置き場所 |
|------|------|----------|
| バッチ書き込み | **service_role** | ルート `.env` の `SUPABASE_KEY` / GitHub Secrets |
| フロント読み取り | **publishable(anon)** | `frontend/.env.local` の `NEXT_PUBLIC_SUPABASE_ANON_KEY` |

`service_role` キーは秘匿情報。`.env.example` やフロント、Gitには絶対に置かない。

---

## Phase 1: データ基盤（バックエンド）

### 1. Supabase テーブル作成
Supabase ダッシュボード → SQL Editor で `db/schema.sql` を実行。

### 2. 環境変数
```bash
cp .env.example .env
# .env を編集: SUPABASE_URL と SUPABASE_KEY(service_role) を設定
```

### 3. 依存インストール & 実行
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python run_daily.py        # 全ドメインのAIBAスコアを算出しSupabaseへ投入
```
> Supabase未設定なら `backend/output/` にJSONを書き出す（動作確認用）。

### 4. 自動化（GitHub Actions）
リポジトリの Secrets に `SUPABASE_URL` / `SUPABASE_KEY`(service_role) を登録。
`.github/workflows/daily.yml` が平日 22:00 UTC（≒米市場閉場後）に日次実行する。
手動実行は Actions タブの「Run workflow」から。

---

## Phase 2: キャリブレーション
データ蓄積後、`config/targets.yaml`（対象）と `backend/aiba/score.py`
（`LAYER_WEIGHTS` / `RSI_PENALTY_COEFF` / 各感度）を市場の実態に合わせて調整する。

---

## Phase 3: ダッシュボード（フロントエンド）

```bash
cd frontend
cp .env.local.example .env.local
# NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_ANON_KEY(publishable) を設定
npm install
npm run dev      # http://localhost:3000
```

- トップ: 3層それぞれのAIBAスコア・ランキング（ヒートマップ）
- 領域クリック: 時系列チャート（AIBA / テクニカル / センチメント / RSI）

## AIBAスコア v1.1 のロジック概要
- **テクニカル割安感** = RSI割安スコア（低RSIほど高得点）と移動平均乖離スコア（平均より下ほど高得点）の平均。
- **層別重み** = 第1層 (T0.7, S0.3) / 第2層 (0.5,0.5) / 第3層 (T0.3, S0.7)。
- **RSIペナルティ** = RSIが50を超えた分だけ減点（過熱の高値掴みを回避）。
- 最終スコア = 重み付き合算 − RSIペナルティ（0〜100にクランプ）。
