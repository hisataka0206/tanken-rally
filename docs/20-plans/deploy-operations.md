# [[デプロイ運用設計]]（Netlify クレジット枯渇対策）

> 作成: 2026-07-31 / 更新: 2026-08-01（フェーズ1完了・[[枯渇中でもブランチデプロイはビルドされる]]を実証） / 対象: [[tanken-rally]]（テクタン）本番公開の運用
> 背景: [[Netlify]] 無料枠のクレジットを使い切り、本番デプロイが停止（`Tekutan is now running on operational credits`）。裏の開発と本番デプロイ回数を切り分ける運用を設計する。

---

## 0. 結論（先に）

- **枯渇の原因は「[[本番デプロイ]]1回＝15クレジット」×月約20回上限**。開発中に main へ何度も push して使い切った。
- **クレジットが復活するのは 2026-08-12**（請求サイクル Jul 12〜Aug 11、翌日リセット）。**明日8/1ではない。**
- **[[ブランチデプロイ]]／[[デプロイプレビュー]]はデプロイ自体はクレジットを消費しない**（無料）。消費するのは「本番ブランチへの publish」だけ。
- **採用＝案B改**（2026-07-31 決定）: repo は **private のままソース秘匿を維持**。**公開版も含めてすべて[[ブランチデプロイ]]で運用し、本番デプロイ（15クレジット）を一切使わない＝実質無料・更新無制限**。
  - 公開版 = **`live` ブランチ**のブランチデプロイ（`live--tekutan.netlify.app`）。
  - テスト = **`beta` ブランチ**のブランチデプロイ（`beta--tekutan.netlify.app`）。
  - **`main`（＝Netlify の production branch）は凍結**（push しない）＝本番デプロイ0回＝クレジット消費0。
  - GitHub Pages は廃止。将来クリーンなURLが欲しければ独自ドメインの**サブドメイン**（例 `app.○○.app`）を `live` ブランチに割当（これもブランチデプロイなので無料）。具体手順は §8。

---

## 1. 現状（実データ・2026-07-31 確認）

| 項目 | 値 |
|---|---|
| プラン | **Free**（$0.00・300クレジット/月・**超過課金なし/自動チャージ不可のハードキャップ**） |
| 請求サイクル | **Jul 12 → Aug 11**（チーム作成日=7/12起点。暦月1日ではない） |
| クレジット復活 | **2026-08-12** |
| 当期消費 | **304クレジット**（300超過。大半が Jul 13/14/17 の本番デプロイ） |
| 残 | 29（⚠️ ただし "operational credits"＝サイト表示維持専用。本番デプロイには使えない） |
| サイト | `tekutan.netlify.app`（GitHub `hisataka0206/tanken-rally` から連携・自動デプロイActive） |
| 最終公開 | Jul 17 |

---

## 2. Netlify クレジット消費の原理（2026 モデル）

| 消費項目 | レート | 備考 |
|---|---|---|
| **本番デプロイ** | **15クレジット/回**（ビルド時間無関係の固定） | 300÷15＝**月約20回が上限**。main への push・merge が毎回これ |
| ブランチデプロイ | **デプロイは無料** | 長期テスト用ブランチの公開。デプロイ回数ではクレジットを食わない |
| デプロイプレビュー | **デプロイは無料** | PR プレビュー等 |
| Web リクエスト | 2クレジット/1万req | 本番・ブランチ・プレビューURLへのアクセス。低トラフィックでは誤差 |
| 帯域 | 20クレジット/GB | 本アプリは静的数百KBのみ配信で誤差（地図/画像は外部配信） |
| コンピュート | 10クレジット/GB時 | Functions/Preview Server 使用時のみ |

**要点**: 本アプリのコストは実質「本番デプロイ回数 × 15」だけ。帯域・リクエストは無視できる。**＝管理すべき変数は"月の本番デプロイ回数"の1つ**。

---

## 3. 何が問題だったか（診断）

- 開発イテレーションのたびに main へ push → **1 push = 15クレジット**。20回で枯渇。
- さらに **GitHub Pages（deploy.yml）と Netlify が両方 main を見て自動デプロイしている可能性**が高い（Netlify 移行後も Pages に戻したため）。この状態だと 1 push で「Pages（無料）＋Netlify本番（15cr）」が同時に走り、Netlify 側だけ課金される二重構成。
- 対策の本質は **「開発の反復」と「本番 publish」を物理的に分けること**。

---

## 4. 運用3案（どれかに決める）

前提の対立: **Netlify の狙い＝ソース秘匿（private repo）**。一方 **GitHub Pages を無料で使うには public repo が必要**（private は GitHub Pro $4/月）。この2つは本来両立しない。ここが選択の分岐点。

### 案A — GitHub Pages に一本化、Netlify は捨てる（repo public）
- 本番も beta も **GitHub Pages**（main→`/`、beta→`/beta/`）。**完全無料・デプロイ回数無制限・クレジット管理不要**。
- 失うもの: ソース秘匿（`src/*.js` は元々ブラウザで読めるので、実質失うのは "リポジトリを見られない" だけ）。
- **最もシンプル。デプロイ上限の悩みが消える。** 秘匿が要らないならこれ。

### 案B — Netlify 本番 ＋ Netlify ブランチデプロイで beta（repo private・推奨：秘匿したい場合）
- repo は **private のまま**（ソース秘匿を維持）。
- **本番** = main → Netlify 本番デプロイ（15cr/回）。**意図的なリリース時だけ**。
- **beta 確認** = `beta` ブランチ → **Netlify のブランチデプロイ**（`beta--tekutan.netlify.app`）。**デプロイは無料**なので、開発イテレーションは何回やってもクレジットを食わない。
- GitHub Pages は不要（private では無料で使えないため元々選べない）。
- **"beta を Git で" という当初案より、実はこちらが低コストで秘匿も保てる**（beta を Git に出す＝public 化が必要で秘匿と矛盾するため）。

### 案C — Netlify 本番 ＋ GitHub Pages で beta（当初の直感）
- beta を GitHub Pages に置くには repo が public 必要 → **その時点でソース秘匿は崩れる**（＝Netlify を使う意味が半減）。または GitHub Pro $4/月 で private のまま Pages。
- 案A（公開容認）か案B（秘匿維持）に寄せた方が筋が良い。**積極的には非推奨。**

> **推奨**: 「ソースのリポジトリを見られたくない」が本当に重要か次第。
> - 重要でない → **案A**（Pages一本化・無制限無料）。
> - 重要 → **案B**（本番Netlify＋beta は Netlify ブランチデプロイ・どちらも実質無料で秘匿維持）。
> どちらでも "beta を Git(Pages) に出す＝public化" は不要になる。

---

## 5. ブランチモデルと運用ルール（案B改）

### ブランチの役割

| ブランチ | Netlify での扱い | URL | デプロイコスト | 用途 |
|---|---|---|---|---|
| `main` | **production branch（凍結）** | `tekutan.netlify.app`（使わない） | 15クレジット/回 | **push しない**。ここを触った時だけ課金される |
| `live` | ブランチデプロイ | `live--tekutan.netlify.app`（**公開URL**） | **無料・無制限** | 一般公開版。ここを更新して公開する |
| `beta` | ブランチデプロイ | `beta--tekutan.netlify.app` | **無料・無制限** | 開発・動作確認 |

### 運用ルール

1. **`main` は原則凍結**。うっかり push しない（1回で15クレジット）。緊急時のみ意図的に使う。
2. **開発は `beta`、公開は `live`**。フロー: `beta` で作って確認 → `live` に merge → `live--tekutan.netlify.app` が更新（無料）。どちらもブランチデプロイなので**回数無制限・クレジット0**。
3. **唯一の従量課金は帯域・リクエスト**（帯域20cr/GB・リクエスト2cr/1万）。本アプリは静的数百KB＋地図/画像は外部配信なので**実質無視できる**。バズって大量アクセスが来た時だけ効いてくる、が唯一の天井。
4. **二重デプロイを止める**: GitHub Pages（`deploy.yml`）は廃止（repo を private 化すると無料では動かないため、どのみち停止）。公開ホストは Netlify に一本化。
5. **公開URLの割り切り**: 当面 `live--tekutan.netlify.app`（`--` 付き）。クリーンにしたくなったら独自ドメインを取り、`app.○○.app` を `live` ブランチに割当（[[ブランチサブドメイン]]・これも無料）。apex（`○○.app` 素）は production branch を指すので使わない。

---

## 6. 決定事項（2026-07-31・案B改確定）

- [x] ソース秘匿は **必要** → repo は **private** 化。
- [x] 公開ホスト = **Netlify に一本化**。GitHub Pages（`deploy.yml`）は廃止。
- [x] 公開版 = **`live` ブランチのブランチデプロイ**（`live--tekutan.netlify.app`）。
- [x] テスト = **`beta` ブランチのブランチデプロイ**（`beta--tekutan.netlify.app`）。
- [x] **`main`（production branch）は凍結**＝本番デプロイ0回＝クレジット消費0。
- [x] 独自ドメインは任意（将来 `live` にサブドメイン割当・無料）。

---

## 7. 実行手順（案B改）

**重要**: 案B改は**本番デプロイを使わない**ので、原理的には **8/12 のクレジット回復を待つ必要がない**（ブランチデプロイは無料）。当初は「現在チームが "operational credits" 状態のため、枯渇中に新規ブランチデプロイのビルドが走るか要検証」としていたが、**2026-08-01 に実証済み → 走る**（下記）。

### ✅ 実証結果（2026-08-01）— [[枯渇中でもブランチデプロイはビルドされる]]

- `beta` を起点に **`live` ブランチを作成・push**（`create_live_branch.command`）。
- Netlify で **`Branch Deploy: live@19e5cbc` が Completed**（11:14）。**クレジット枯渇中でもブランチデプロイのビルドは走る**ことを確認。
- 同時刻、`main`（production）は従来どおり全て **`Skipped due to account credit usage exceeded`** ＝ **本番デプロイ0回・クレジット消費0** を維持。
- `https://live--tekutan.netlify.app` は配信 OK（`v1.2.0 リリース版`・コンソールエラーなし）。
- **結論**: 案B改は **8/12 のクレジット回復を待たず、いま成立**。移行完了。

### フェーズ1 — `live` を公開URLとして立てる（✅ 完了）

1. [x] **`live` ブランチを作成**（**`beta` から分岐**＝最新版を公開起点に）してリモートへ push。※`main` は25コミット古い凍結版のため起点にしない判断（2026-08-01）。
2. [x] **Netlify でブランチデプロイを有効化**（Project → Configuration → Build & deploy → Branches and deploy contexts）。`live` と `beta` を追加 → `live--tekutan.netlify.app` / `beta--tekutan.netlify.app` が発行。
3. [x] **検証**: `live` の push で **ビルドが走った**（Completed）→ 公開URLとして採用（フェーズ2へ）。
4. [ ] **Google Maps APIキーの HTTPリファラー**に追加（Google Cloud Console）。やらないと地図が真っ白：
   - `https://live--tekutan.netlify.app/*`
   - `https://beta--tekutan.netlify.app/*`
5. [ ] `live--tekutan.netlify.app` で **地図・写真アップロード・PDF・キャラ生成**が通るか確認（4の後）。

### フェーズ2 — 旧公開の停止と秘匿化

6. **公開URLを差し替え**: QR・CM・README の公開URLを `github.io` → `live--tekutan.netlify.app` に更新（`docs/00-business/cm-howto-storyboard.md` の要記入欄含む）。
7. **GitHub Pages を停止**: `.github/workflows/deploy.yml` を無効化（削除 or `on:` を `workflow_dispatch` のみに）。
8. **repo を private 化**（GitHub → Settings → Danger Zone → Change visibility）。本番は Netlify ブランチデプロイなので影響なし。

### フェーズ3 — 定常運用（[[betaで開発・liveで公開]]）

9. **開発は `beta`、公開は `live`**。普段は **`beta` だけで作業してコミット**すればよい（無意識運用）。
   - フロー: `beta` で作って push → `beta--tekutan.netlify.app` で確認 → **`live` に merge して push** → `live--tekutan.netlify.app` が更新（無料・無制限）。
   - **公開は `publish_live.command` をダブルクリックするだけ**（repo 直下）。中身: `beta` を push → `live` に切替えて `beta` を反映・push → **必ず `beta` に戻して終了**。未コミットや競合時は中断して `beta` に戻る安全設計。**`main` には一切触れない**。
   - 原則 **`live` を直接編集しない**（`beta`→`live` の一方向 merge のみ）。公開URLは常に beta で検証済みの状態になる。
10. **`main` は触らない**（触ると15クレジット）。
11. 月次で Usage を軽く確認（想定は production deploys 0・帯域わずか）。バズって帯域が伸びたら Cloudflare Pages（無料・帯域無制限級）等への移行も検討。

### 運用スクリプト（repo 直下・Mac 側で実行）

| スクリプト | 用途 |
|---|---|
| `create_live_branch.command` | 初期セットアップ：`beta` を起点に `live` を作成・push（実施済 2026-08-01） |
| `publish_live.command` | 定常運用：`beta → live` 公開を1操作で実行。終了時は必ず `beta` に戻る |

### 分担メモ
- **Claude が実施可能**（コード/書類）: `deploy-operations.md`・`README` 更新、`deploy.yml` 無効化のコード準備、CM/README のURL差し替え、運用スクリプト（`.command`）生成。※git 書き込み（push 等）は Mac 側でユーザーが `.command` を実行。
- **ユーザー操作**（アカウント）: Google Maps リファラー追加、GitHub の private 化、`.command` の実行。→ Netlify 設定は Claude が Chrome で代行済み（`live`/`beta` ブランチデプロイ有効化・2026-08-01）。

---

## 参考（クレジット単価・リセット挙動の出典）

- Netlify Docs: How credits work / Billing FAQ（credit-based plans）
- 本番デプロイ=15クレジット固定、ブランチ/プレビューはデプロイ無料、リセット=請求サイクル開始日（チーム作成日基準）
- 関連: `docs/00-business/public-release-plan.md`（移行経緯・無料枠比較）
