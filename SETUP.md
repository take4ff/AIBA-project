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
Supabase ダッシュボード → SQL Editor で以下を実行：
- `db/schema.sql`（domains / daily_metrics / RLS）
- `db/predictions.sql`（1ヶ月先予測）
- `db/watchlist.sql`（ウォッチリスト・per-user）
- `db/user_portfolio.sql`（ポートフォリオ：user_holdings / ticker_metrics / ticker_fundamentals）
- `db/latest_metrics.sql`（ランキング集計ビュー：フロントの取得を約1万行→235行に削減。未作成でもフロントは従来ロジックへ自動フォールバックする）
- `db/theme_attention.sql`（大衆注目度：Wikipedia閲覧数。attention_job.py が日次更新、/themes に表示）
- `db/insider_trades.sql`（インサイダー売買：SEC Form 4。insider_job.py が日次更新、米国銘柄の詳細ページに表示）

**認証（ログイン）**：Authentication → Providers の **Email** を有効化（既定ON）。
新規登録後すぐ使うには **「Confirm email」を OFF** にする（個人利用向け）。

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

### 補足: 過去データのバックフィル
グラフを充実させるため、過去数ヶ月分を遡って投入できる。テクニカルは日次で
完全再構築、センチメントは負荷を抑えて一定間隔で算出し日次に前方補完する。
```bash
cd backend && source .venv/bin/activate
python backfill.py --months 6                      # 全ドメイン・過去6ヶ月
python backfill.py --months 3 --only quantum_computing
python backfill.py --months 6 --sentiment-every-days 14  # 隔週でセンチメント取得
python backfill.py --months 6 --no-sentiment       # テクニカルのみ高速
```
> センチメント取得はAPI負荷が高いため、6ヶ月・月次刻みで全ドメイン約15〜20分。

### 4. 自動化（GitHub Actions）
リポジトリの Secrets に `SUPABASE_URL` / `SUPABASE_KEY`(service_role) を登録。
`.github/workflows/daily.yml` が平日 22:00 UTC（≒米市場閉場後）に日次実行する。
手動実行は Actions タブの「Run workflow」から。

日次ジョブの流れ：`run_daily.py`（スコア）→ `predict.py`（予測）→
`portfolio_job.py`（売り時）→ `check_data.py`（品質チェック）。
品質チェックが異常を検知するとジョブが失敗し、**GitHub標準の失敗通知メール**で気づける。
Slackにも飛ばしたい場合は Secrets に `SLACK_WEBHOOK_URL` を登録（未設定なら何もしない）。

**フロントの即時キャッシュ更新（任意）**：バッチ完了直後に Vercel の ISR キャッシュを
再検証し、TTL（10分）待ちのコールドミスを防ぐ。
1. 長いランダム文字列を生成し、Vercel の環境変数 `REVALIDATE_TOKEN` に設定
2. GitHub Secrets に `REVALIDATE_TOKEN`（同じ値）と `REVALIDATE_URL`
   （`https://<your-site>/api/revalidate`）を登録
未設定なら何もしない（従来どおり10分TTLで更新）。

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
