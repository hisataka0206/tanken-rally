# [[キャラ画像生成]]ルール（[[背景混入バグ]]の再発防止）

作成日: 2026-07-17 ／ 対象: [[テクタン]]（[[たんけんラリー]]）のキャラ自動生成（[[NanoBanana Pro]] / Gemini 3 Pro Image）
関連コード: `src/utils/chargen.js` の `buildPrompt()`、`gas/Code.gs` の `generateCharacters()`

## 何が起きていたか（不具合）
生成キャラ画像（例：[[ゴキキツ]]）に、**キャラの周囲に本来入らない「画像編集ソフトの画面／UIらしき背景」が描き込まれる**不具合。過去にも発生し、**再発**した。

前提：**この画像は編集ソフトで加工したものではなく、生成AIが一発生成したもの**。つまり書き出しミスではなく、**生成AI自身がUIごとキャラを描いてしまっている**。

## 根本原因（今回特定）
**画像生成モデル（Gemini画像）には、テキストとは別枠の「ネガティブプロンプト」が無い。** 渡した文章はすべて"描いてほしい条件"として作用する。

旧プロンプトは、UI混入を防ごうとして **「no Photoshop」「no editor interface」「no toolbars」「no menu bar」「no layers panel」「no checkerboard」「NOT a screenshot」** のように**不要物の名前を大量に列挙**していた（`buildPrompt` 内に2箇所）。

その結果、モデルには **「Photoshop」「toolbar」「checkerboard」等の概念が強く入力**され、**否定しているつもりが逆に描画を誘発**していた（"ピンクの象を想像するな"現象＝negation backfire）。これが「指示を入れているのに再発する」理由。

> **教訓：ネガティブプロンプト非対応のモデルでは、"描いてほしくないもの"の名前を書いてはいけない。** 書くほど出る。

## 直し方（今回の対応・恒久ルール）
1. **不要物の名前を一切書かない**：`Photoshop / editor / UI / interface / toolbar / menu / panel / ruler / checkerboard / screenshot / mockup / window / frame` などの語を**プロンプトから全削除**。
2. **望む背景をポジティブに強く言い切る**：
   > "The character is fully isolated on a single flat, empty, pure-white background. The whole background is one solid white color and completely bare — only the one character is in the picture…"
3. **否定は画風・構図の最小限だけ**：`not realistic, not 3D, not a photo` と `exactly one character only` 程度に絞る（UI語は書かない）。

## これから守るチェックリスト（新キャラ・プロンプト改訂時）
- [ ] プロンプトに **UI/編集ソフト系の語（Photoshop, toolbar, panel, checkerboard, screenshot 等）が1つも無い**。
- [ ] 背景は **ポジティブ指定のみ**（"single flat empty pure-white background, only the character"）。
- [ ] 否定は画風・構図レベルに限定（realistic/3D/photo/複数体）。不要物の固有名詞は書かない。
- [ ] 参照画像を使う場合、その中に**UI・文字・枠が写っていない**こと（現状は参照画像なし＝テキストのみ）。
- [ ] 生成後、周囲に**枠・パネル・格子背景**が出ていないか目視確認。出たら「プロンプトに不要物の名前が復活していないか」をまず疑う。

## 既存の混入画像について
プロンプトは**実行時生成**（生成のたびにこの新プロンプトを使用）なので、**今後生成されるキャラはクリーン**になる。すでに混入してしまった個体（例：[[ゴキキツ]]）は画像がDrive/図鑑に保存済みのため自動では直らない。対処は次のいずれか：
- そのキャラを**再生成**する（adminのマスターモードでの再試行、または該当キャラを消して作り直す）。
- どうしても個別救済が要るなら、キャラだけを切り出し／背景透過にして作り直す。

※ ファイル更新は同名上書き（`_Ver1` などは付けない）。ディレクトリ・ファイル名は英字。
