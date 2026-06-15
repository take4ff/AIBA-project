# 📊 AIBA — 次世代技術投資分析システム

**Advanced Investment & Behavior Analytics**

世間の熱狂による「割高な高値掴み」を避け、水面下で熱を帯びている次世代技術領域の最適な投資タイミング（押し目・初動）を定量的に検知する。テクニカル指標とセンチメント指標の**乖離**を分析し、データドリブンな投資判断を支援するダッシュボード。

- **本番稼働中**：GitHub Actions が平日 日次でデータ収集・スコア計算・予測 → Supabase 蓄積 → Vercel で公開。
- セットアップ・運用手順は **[SETUP.md](./SETUP.md)** を参照。

---

## ✨ 主な機能

### 買い（発掘）
- **AIBAスコア v1.1**：層別重み付け＋RSIペナルティの総合「買い時度」(0–100)
- **成長×割安スコア**／**センチメント傾き(↑↓)**／**🔀乖離**（センチメント先行×株価出遅れ＝仕込み好機）
- **保有目安バッジ**：🌱長期（構造的成長）／⚡短期（リバウンド）／⚖️両面
- **1ヶ月先予測**：買い場入り確率＋予測AIBA（平均回帰＋ロジスティック。`predict.py --backtest` で naive 比較検証済み）
- **購入目安**：妥当値(25日MA)・押し目買い目安(−1σ)・下値支持(60日安値)を銘柄詳細に表示
- **⭐ Pickupページ**：地域・ETF/個別を問わず「今買い」候補を横断抽出

### 売り（保有管理）
- **マイ・ポートフォリオ**（ログイン・アカウント紐付け）：保有銘柄を追加/編集/削除
- **過熱度**＋**売り場ハイライト**＋**売りシグナル合成**（テクニカル過熱＋ファンダ〈高PER/減益〉＋決算接近）
- 取得単価比の**損益％**、次回決算日アラート

### 横断・補助
- **地域タブ**（Global / 米国 / 日本）× **業界ETF / 個別株トグル**。ランキングは最新株価＋各スコアを併記
- **業界ページ** `/theme/<テーマ>/<地域>`：業界ETF＋有名個別株をAIBA順に比較
- **時系列チャート**：株価×スコア二軸、買い場/売り場ハイライト、**ボリンジャーバンド**、**MACD**、通貨対応（円/ドル）
- **☆ ウォッチリスト**（ログイン・本人のみ）、**スコアの見方ガイド**
- **乖離アラート通知**（任意・Slack）、**運用監視**（日次品質チェック）

---

## 🎯 監視ユニバース

**10テーマ × 3地域（Global/米国/日本）× 業界ETF＋複数個別株**（約90ドメイン）。
時間軸で3層に分類し、層に応じた指標で監視する。定義は [`config/targets.yaml`](./config/targets.yaml)。

| 階層 | テーマ | 狙い |
|---|---|---|
| **第1層：現在のブーム** | 先端半導体、生成AI基盤、クラウドインフラ | 過熱が収まった「押し目」をRSI等で的確に狙う |
| **第2層：次なる波** | 冷却・電力インフラ、エッジAI・ロボ、バイオインフォ、エンタメ・コンテンツ | テクニカルとセンチメントの「バランス成長」を捉える |
| **第3層：未来の開拓地** | 量子コンピューティング、宇宙インフラ、次世代エネルギー | 株価が動く前の「研究開発の熱量」を先行指標で拾う |

---

## 🧮 AIBAスコア v1.1

階層に応じて指標の重みを動的に変える 0–100 のスコア（[`backend/aiba/score.py`](./backend/aiba/score.py)）。

**インプット**
- **テクニカル（事実）**：株価・出来高・RSI(14)・移動平均(25)乖離率（`yfinance`）
- **センチメント（先行）**：GitHub（新規リポジトリ＋**コミット活動量**）× arXiv（論文）× **Hacker News** × **Google Trends** の平均増加率（取得できた指標のみ平均）

**ロジック**
- テクニカル割安感＝RSI割安スコアと移動平均乖離スコアの平均
- 層別重み＝第1層 (T0.7/S0.3)・第2層 (0.5/0.5)・第3層 (0.3/0.7)
- RSIが50超で過熱ペナルティ → 重み付き合算 − ペナルティ（0–100にクランプ）

---

## 🧭 ページ構成

`Global / 米国 / 日本 / ⭐Pickup / 🔎スクリーナー / ☆お気に入り / 💼マイ・ポートフォリオ / 📊検証`（全ページ共通ナビ）
- 各ランキング → ETF行は**業界ページ**、個別株行は**銘柄詳細**へ
- 銘柄詳細：株価×スコアチャート、買い場ハイライト、業界AIBA比較、MACD/ボリンジャー、1ヶ月予測
- ログイン（メール＋パスワード）でウォッチリストとポートフォリオが有効化

---

## 🏗️ アーキテクチャ

運用コストを無料枠に抑えた構成。**重い処理は GitHub Actions、Vercel は表示のみ**。

```
yfinance / GitHub / arXiv / Hacker News / Google Trends
        │ 収集・スコア計算・予測（Python）
        ▼  ── GitHub Actions（日次cron）
Supabase (PostgreSQL Free)
        │ 公開データは anon キーで読み取り / RLS 保護
        │ ユーザーデータ(ウォッチリスト/保有)は本人のみ
        ▼
Next.js ダッシュボード (Vercel)
```

### ディレクトリ構成
```
AIBA-project/
├── config/targets.yaml          # 監視ユニバース（10テーマ×地域×ETF/個別株）
├── db/                          # Supabase スキーマ
│   ├── schema.sql               #   domains / daily_metrics / RLS
│   ├── predictions.sql          #   予測
│   ├── watchlist.sql            #   ウォッチリスト（per-user・RLS）
│   └── user_portfolio.sql       #   user_holdings / ticker_metrics / ticker_fundamentals
├── backend/                     # データ収集・スコア・予測（Python）
│   ├── aiba/{config,technical,sentiment,score,forecast,db,pipeline}.py
│   ├── run_daily.py             #   日次スコア
│   ├── predict.py               #   1ヶ月先予測（--backtest で検証）
│   ├── portfolio_job.py         #   保有ティッカーの過熱度・ファンダ
│   ├── notify.py                #   Slack 日次アラート（任意）
│   ├── check_data.py            #   データ品質チェック
│   ├── backfill.py              #   過去数ヶ月のバックフィル
│   └── tests/                   #   pytest（CI: .github/workflows/test.yml）
├── frontend/                    # Next.js ダッシュボード
└── .github/workflows/{daily,test}.yml
```

日次ジョブの流れ：`run_daily → predict → portfolio_job → check_data → notify`。

---

## 🗺️ 今後のアイデア（未了）

- [ ] **ユニバース拡張**：新領域（核融合・合成生物学 等）の追加、新技術・トピック用ページ
- [x] **バックテスト結果のUI表示** → `/verify`（実績・IC・買い優位）
- [x] **スコア妥当性の定点記録・可視化** → `/verify` 定点記録（1/3/6ヶ月の買い当否）
- [x] **銘柄詳細での決算情報の拡充**：ユニバース個別株もファンダ取得し、PER/予想PER/EPS・売上成長/直近サプライズ/次回決算＋**ルールベースの解釈**（割安/割高・増益/減益・来期見通し・決算接近の注意）を表示
- [ ] **UI/UX の継続改善**、機能が増えてきたため全体的に整理
- [ ] **特許**をセンチメント源に追加（PatentsView APIキー前提・保留）
- [ ] 過去の期間増やす、2025年は全て保存
- [ ] 各スコアの定義を詳細にまとめたページ作成

### 競合から取り込み候補（[`docs/research.md`](./docs/research.md) 2026-06 第2回調査）
- [x] **健康度レーダー**（銘柄詳細）：AIBA/割安(テク)/熱量/非過熱/押し目度（＋業績）を5〜6角形で可視化（Simply Wall St風）
- [x] **フェアバリュー（相対PER）**：自社予想PER vs 同地域ピア中央値で「◯%割安/割高」（±60%上限・注記つき）
- [x] **一行ナラティブ（自動要約）**：AIBA＋相対PER＋業績＋熱量＋予測＋決算接近を1〜2文に自動要約（銘柄詳細の冒頭）
- [x] **カスタムスクリーナー** → `/screener`：地域/種別/階層/AIBA/買い場確率/予想PER/熱量/乖離を即時フィルタ＋並び替え（Pickupの発展）
- [x] **ポートフォリオ配分分析**：保有のテーマ別/地域別配分バー＋集中度（最大比率・実効銘柄数・HHI）。株数入力で評価額ベース、未入力は均等ウェイト

> 実装済みの機能は「✨ 主な機能」を参照。

### 後回し
- [ ] **乖離アラートの LINE / メール対応**（現状は Slack）
- [ ] **CSVエクスポート**（ランキング/ポートフォリオ）


## supabase warning
Leaked Password Protection Disabled
SECURITY

Entity

Auth
Issue

Supabase Auth prevents the use of compromised passwords by checking against HaveIBeenPwned.org. Enable this feature to enhance security.
Description

Leaked password protection is currently disabled.


Summary of the lint issue
Leaked Password Protection Disabled (Auth) means your Supabase Auth configuration is currently not rejecting passwords known to be compromised. Supabase can check proposed passwords against the HaveIBeenPwned (Pwned Passwords) API, but right now that protection is off.

Why this matters
If leaked/compromised passwords are allowed, attackers can more easily attempt credential stuffing or reuse passwords from previous breaches.

Suggested fixes
Enable “Prevent the use of leaked passwords” in Supabase Auth settings

In the Supabase Dashboard, go to the Auth settings for password strength and turn on leaked password protection.
Note: Supabase’s docs state this feature is available on the Pro Plan and above.
If you’re on Free/other unsupported tiers

Upgrade to Pro+ to enable this specific control.
In the meantime, mitigate risk by strengthening other password policies (minimum length + required character sets), also available in Auth settings.
After enabling, verify the behavior

Try signing up (or setting/changing a password) with a known compromised password pattern and confirm Auth rejects it with a weak/leaked-password related error.

---

## 📈 キャリブレーション記録

スコアの妥当性を定点観測し、重み調整の判断材料を残す（`backend/backtest.py`、H=21営業日先リターン基準）。

### 2026-06（履歴6ヶ月・センチメント週次バックフィル）
- **IC**（先行リターンとの順位相関）：AIBA +0.053 / テクニカル −0.003 / **センチメント +0.130**
- **買い戦略**（AIBA≥60）：平均1ヶ月先 **+8.05%**（全体 +5.38% ＝ +2.7pt優位）
- **層別 最適 w(テクニカル)**：第1層 0.0（IC 0.248）/ 第2層 0.4（0.081）/ 第3層 0.0（0.147）
- **示唆**：現行重み（L1 0.7 / L2 0.5 / L3 0.3）は**センチメントを過小評価**の可能性。週次化でセンチメント先行性が顕著に改善（月次→週次：IC 0.022→0.130、買い優位 +0.9pt→+2.7pt）。
- **判断**：履歴が浅く先行リターンも重複するため**現状維持（様子見）**。候補の穏当な再調整＝L1 0.5/0.5・L2 0.4/0.6・L3 0.25/0.75。**次回（3ヶ月時点）に再評価**。

### 2026-06 定点記録（out-of-sample・月次スナップショット7回をbackfillして評価）
- **1ヶ月**：買い判定(AIBA≥60) **+12.24%**（全体 +5.26% / 勝率66% / n=71）→ **短期は有効**
- **3ヶ月**：買い判定 +0.17%（全体 +18.36% / 勝率45% / n=29）→ **中期は劣後**（押し目買いは短期反発向き。上昇地合いで出遅れ）
- **6ヶ月**：評価待ち（経過後に自動算出）
- **示唆**：AIBAの買いは**1ヶ月スパン向き**。中期保有には不向きな可能性。保有目安バッジ（短期/長期）の妥当性を今後も追跡。
- ※3ヶ月はサンプル小・特定期間のため暫定。日次ジョブがスナップショットを積み増し精度向上。`/verify`（📊検証）で常時確認可能。