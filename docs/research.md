# 類似サービス調査（競合・参考プロダクト）

AIBA の立ち位置確認と、取り込めるアイデアの抽出（2026-06 調査）。

## 1. AIスコアリング系（AIBAのスコア概念に最も近い）

| サービス | 概要 | AIBAへの示唆 |
|---|---|---|
| **Danelfin** | 全銘柄に AIスコア 1–10（今後3ヶ月でS&P500を上回る確率）。**Technical / Fundamental / Sentiment の3分解**で「理由」を提示。600+テクニカル・150ファンダ・150センチメント指標。実績（バックテスト）を公開。 | スコアの**分解表示**は既に同等。学ぶ点：①**実績/バックテストをUIで前面に**（信頼性）、②「**ベンチマーク超過確率**」という表現、③3ヶ月など**明確なホライズン** |
| **Kavout (Kai Score 1–9)** | ファンダ＋価格＋センチメント＋オルタナを日次でML統合、9000銘柄をスクリーニング | 日次・全銘柄スクリーニングの思想。AIBAは「テーマ×地域」で差別化 |
| **Tickeron** | チャートパターン認識・売買シグナル・自動売買ロボ | パターン認識は別路線。AIBAは中長期の発掘寄り |

## 2. オルタナデータ・ダッシュボード系

| サービス | 提供データ | AIBAへの示唆 |
|---|---|---|
| **Quiver Quantitative** | 議会取引・インサイダー・政府契約・ロビイング・**特許**・**Google Trends**・アプリ評価・機関保有・WSB言及。**トレンドマップ＋過熱ゲージ**（heating/cooling）、CSVエクスポート、アラート、ウォッチリスト、バックテスト戦略 | **過熱ゲージ**＝AIBAのセンチメント傾き(↑↓)と同思想。学ぶ点：**Google Trends・特許**の追加、**CSVエクスポート** |
| **AltIndex** | Reddit/SNSモメンタム、求人、Webトラフィック、アプリDLをシグナル化 | 需要側オルタナ（求人・トラフィック）は将来の拡張候補 |
| **VertData / Congressional系** | 議会取引・SEC・空売り残をAIスコア化 | 米国向けの定番。優先度は中 |

## 3. 「研究の熱量」を先行指標にする学術的裏付け（AIBAの核）

- 研究（論文）→**特許**→製品化、という進行が確認されている。**論文が最も早く、特許が次段階**の先行指標。
- AIBA は **arXiv（論文）＋ GitHub（開発）＋ Hacker News（注目）** を使っており、**価格より手前の最早期**を捉えている点が差別化。
- **ML-Quant** 等は arXiv/SSRN を集約（研究ソースの参考）。

## 4. AIBA の差別化と取り込み候補

**差別化（強み）**
- 「水面下の研究開発の熱量」を**最早期の先行指標**として、テーマ×地域で体系化
- **買い（発掘）と売り（保有の過熱）の両面**＋層別の時間軸思想
- スコアの**分解・透明性**（テクニカル/センチメント/乖離/保有目安）

**取り込み候補（優先順）**
1. **実績・バックテストをUIに前面表示**（Danelfin流の信頼性）← `backtest.py` の結果を見せる
2. **特許を新たなセンチメント源に**（論文→特許→製品の中間段階を補完。Google Patents/USPTO）
3. **Google Trends**（需要・関心の先行）を補助指標に（`pytrends`）
4. **CSVエクスポート**（ランキング/ポートフォリオ）
5. （米国向け）**議会取引・インサイダー**等のオルタナ（高関心だが優先度中）
6. 「**ベンチマーク超過確率**」表現の追加（現状の買い場確率の発展）

---

---

## 第2回調査（2026-06）— 成熟後の追加取り込み候補

AIBAが多機能化した段階で、まだ無い機能を競合から再抽出。

| 出典 | 機能 | AIBAへの取り込み |
|---|---|---|
| **Simply Wall St** | **フェアバリュー（理論株価）＋◯%割安/割高** | ファンダ基準の妥当株価。AIBAの押し目目安(テクニカル)を補完 |
| **Simply Wall St** | **スノーフレーク（健康度レーダー）** | 要素スコアを5角形可視化。既存スコア活用で軽く、視覚効果大 ★ |
| **Simply Wall St** | **ナラティブ（物語＋前提→FV）** | AIBAの自動解釈の発展。まず一行要約から |
| **Finviz / Stock Rover** | **カスタムスクリーナー**（多条件） | Pickupを多条件フィルタ化（スコア/層/地域/PER） |
| 各種 | **カスタムアラート（メール）** | per-user の条件アラート（Slack要約から拡張） |
| 各種 | **ポートフォリオ分析**（配分・集中度・リスク） | 保有のテーマ/地域エクスポージャー、look-through |
| 各種 | **CSVエクスポート / 列カスタマイズ / 横並び比較** | データ持ち出し・比較性 |

**取り込み優先（簡単×効果）**：①健康度レーダー → ②フェアバリュー(相対PER) → ③一行ナラティブ → ④カスタムスクリーナー → ⑤CSV → ⑥ポートフォリオ配分分析。

### Sources（第2回）
- [Simply Wall St — Snowflake分析](https://simplywall.st/stocks/us/software/nyse-snow/snowflake)
- [Simply Wall St — Narratives](https://support.simplywall.st/hc/en-us/articles/13416018054415-Getting-Started-with-Narratives)
- [Best Stock Screeners 2026 (Liberated Stock Trader)](https://www.liberatedstocktrader.com/best-stock-screeners/)
- [Best Portfolio Trackers 2026 (Portfolio Genius)](https://portfoliogenius.ai/blog/best-portfolio-trackers-2026)

---

### Sources
- [Danelfin](https://danelfin.com/)
- [Kavout review (WallStreetZen)](https://www.wallstreetzen.com/blog/kavout-review/)
- [Quiver Quantitative review (WallStreetZen)](https://www.wallstreetzen.com/blog/quiver-quantitative-review/)
- [AltIndex](https://altindex.com/)
- [Patents as Early Indicators of Technology and Investment Trends (NCBI)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6019852/)
- [Google Trends + technical indicators for stock prediction (ResearchGate)](https://www.researchgate.net/publication/371689589_Google_Trends_and_Technical_Indicator_based_Machine_Learning_for_Stock_Market_Prediction)
- [awesome-ai-in-finance (GitHub)](https://github.com/georgezouq/awesome-ai-in-finance)
