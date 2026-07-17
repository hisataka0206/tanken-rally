// OpenAI ユーティリティ。
// ★セキュリティ: OpenAI キーはブラウザに出さない。すべて GAS プロキシ経由で呼ぶ
//   （キーは GAS の Script Property OPENAI_API_KEY に保持）。setAiBackend(drive) で注入する。
import { LANG } from './i18n.js?v=106';

let _drive = null;
export function setAiBackend(drive) { _drive = drive; }

// GAS プロキシ経由で OpenAI chat/completions を呼ぶ
async function chat(messages, { model = 'gpt-4o-mini', max_tokens = 350, temperature = 0.3 } = {}) {
  if (!_drive || typeof _drive.openaiChat !== 'function') throw new Error('AI backend 未設定');
  const res = await _drive.openaiChat({ messages, model, max_tokens, temperature });
  return String((res && res.text) || '').trim();
}

// Blob → base64（データURLの本体部分だけ）
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

export async function fetchOriginStory(stationName) {
  let systemPrompt, userPrompt;
  if (LANG === 'en') {
    systemPrompt = `You are "Explorer Doctor" telling children about the origins of Japanese place names.
Strict rules:
1. Only share information you are confident about.
2. If the etymology is uncertain or unknown, honestly say so ("the origin is not clearly known", "there are several theories").
3. Do not fabricate or fill in plausible-sounding content.
4. When multiple theories exist, present them ("one theory says ...", "another theory says ...") without asserting one as definitive.
5. Distinguish between confirmed historical facts and folklore/theories.
6. Always end with "※ Multiple theories may exist."

Tone: friendly, polite English. 3-5 sentences. Vocabulary suitable for an 8-year-old.`;
    userPrompt = `Please explain the origin of the place / station name "${stationName}".`;
  } else {
    systemPrompt = `あなたは日本の地名の由来を子どもに伝える「たんけん博士」です。
以下のルールを厳守してください：

1. 由来や語源について、自分が確実に知っている情報のみを伝える。
2. はっきりした定説がない場合や知らない場合は、「はっきりした由来はわかっていません」「いくつかの説があります」と正直に書く。
3. 推測で埋めたり、もっともらしい話を創作したりしない。
4. 一般的に語られている説が複数ある場合は「○○という説があります」「△△とも言われています」のように、断定を避ける。
5. 出典が明確な事実（公式の歴史記録など）と、説や言い伝えを区別して書く。
6. 文末に必ず「※ 諸説あります」と付ける。

口調はやさしいですます調。3〜5文。小学校3年生でも分かる言葉で。`;
    userPrompt = `「${stationName}」という地名・駅名の由来を教えてください。`;
  }
  return await chat(
    [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
    { max_tokens: 350, temperature: 0.3 }
  );
}

// Wikipedia（日本語/英語）から、スポット名に一致する記事の冒頭抜粋を取得する。
// MediaWiki API は origin=* で匿名CORSに対応するため、ブラウザから直接取得できる（GAS不要）。
// 戻り値: { title, extract } または null（見つからない/失敗）。
async function fetchWikipediaExtract(query, spotName, wikiLang) {
  try {
    const host = (wikiLang === 'en') ? 'en.wikipedia.org' : 'ja.wikipedia.org';
    const url = `https://${host}/w/api.php?action=query&format=json&generator=search`
      + `&gsrsearch=${encodeURIComponent(query)}&gsrlimit=1`
      + `&prop=extracts&exintro=1&explaintext=1&redirects=1&origin=*`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    const pages = data && data.query && data.query.pages;
    if (!pages) return null;
    const page = Object.values(pages)[0];
    if (!page || !page.extract) return null;
    // 別物（同名の別ページ）を掴まないよう、緩い関連チェック
    const norm = s => String(s || '').replace(/[\s　]/g, '').toLowerCase();
    const a = norm(spotName), tt = norm(page.title);
    const shareSub = (x, y) => { for (let i = 0; i + 2 <= x.length; i++) { if (y.includes(x.slice(i, i + 2))) return true; } return false; };
    const related = a && tt && (tt.includes(a) || a.includes(tt) || shareSub(a, tt) || norm(page.extract).includes(a));
    if (!related) return null;
    let extract = String(page.extract).replace(/\s+/g, ' ').trim();
    if (extract.length > 1000) extract = extract.slice(0, 1000) + '…';
    return { title: page.title, extract };
  } catch (_) { return null; }
}

// 生成キャラに紐づける「スポットの史跡にまつわる短い物語」を作る。
// ★Wikipedia の抜粋を取得できたら、それ**だけ**を根拠に子ども向けへ書き直す（グラウンディング）。
//   取れなければ、事実に慎重なフォールバック（モデル知識・諸説あり）で生成する。失敗時は ''。
export async function fetchSpotStory(spotName, category, opts = {}) {
  if (!spotName) return '';
  const isHistoric = category === 'historic';
  const wikiLang = (LANG === 'en') ? 'en' : 'ja';
  const station = String((opts && opts.station) || '').replace(/駅$|\s*Station$/i, '').trim();
  const query = station ? `${spotName} ${station}` : String(spotName);
  const wiki = await fetchWikipediaExtract(query, spotName, wikiLang);

  let systemPrompt, userPrompt;
  if (wiki && wiki.extract) {
    // --- グラウンディング版（Wikipedia抜粋を唯一の根拠に）---
    if (LANG === 'en') {
      systemPrompt = `You are "Explorer Doctor" telling children a short story about a Japanese place/historic site.
Use ONLY the provided Wikipedia excerpt as your source.
Rules:
1. Base everything on the excerpt. Do NOT add facts not in it, and do NOT invent.
2. If the excerpt doesn't clearly say something, don't claim it.
3. 2-3 sentences, warm and friendly, vocabulary for an 8-year-old.
4. Distinguish facts from legends if the excerpt does.
Output only the story text.`;
      userPrompt = `Historic site / place: "${spotName}"\n\n[Wikipedia excerpt]\n${wiki.extract}\n\nWrite a short kid-friendly story that makes them want to visit.`;
    } else {
      systemPrompt = `あなたは子どもに史跡や場所の話を伝える「たんけん博士」です。
必ず、下の【資料】（ウィキペディアの抜粋）**だけ**を根拠にしてください。
ルール：
1. 資料に書かれていることだけを使う。資料に無い事実は足さない・創作しない。
2. 資料からはっきり読み取れないことは断定しない。
3. 2〜3文。小学校3年生でも分かる言葉。やさしいですます調で、わくわくする語り口。
4. 事実と言い伝え・伝説は、資料の書き方に合わせて区別する。
本文だけを出力してください。`;
      userPrompt = `史跡・場所：「${spotName}」\n\n【資料（ウィキペディア）】\n${wiki.extract}\n\nこの場所について、子どもが行きたくなる短いお話にしてください。`;
    }
    try {
      const story = await chat(
        [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        { max_tokens: 260, temperature: 0.4 }
      );
      if (!story) return '';
      return story + (LANG === 'en' ? '\n\n(Source: Wikipedia)' : '\n\n（出典：ウィキペディア）');
    } catch (_) { return ''; }
  }

  // --- フォールバック（Wikipediaに該当なし：モデル知識＋強い慎重ルール）---
  if (LANG === 'en') {
    systemPrompt = `You are "Explorer Doctor" telling children a short, real-life story about a place or historic site in Japan.
Strict rules:
1. Only share what you are confident about. If details are uncertain or unknown, say so honestly.
2. Never fabricate or fill in plausible-sounding content.
3. When theories differ, present them ("one theory says ...") without asserting one as definitive.
4. Distinguish confirmed facts from folklore/legends.
5. 2-3 sentences, vocabulary for an 8-year-old, warm and friendly.
6. If anything is uncertain, end with "※ Details may vary by source."`;
    userPrompt = `Tell a short kid-friendly story about ${isHistoric ? 'the historic site' : 'the place'} "${spotName}".`;
  } else {
    systemPrompt = `あなたは子どもに、日本の実在する史跡や場所の「ちょっとした物語」を伝える「たんけん博士」です。
以下のルールを厳守してください：
1. 確実に知っていることだけを書く。あいまい・不明なら「はっきりとはわかっていません」と正直に書く。
2. 推測で埋めたり、もっともらしい作り話をしたりしない。
3. 説が複数ある場合は「○○という説があります」のように断定を避ける。
4. 出典が明確な事実と、言い伝え・伝説を区別する。
5. 2〜3文。小学校3年生でも分かる言葉。やさしいですます調で、わくわくする語り口。
6. 不確かさがある場合は文末に必ず「※ 諸説あります」と付ける。`;
    userPrompt = `${isHistoric ? '史跡' : '場所'}「${spotName}」にまつわる、子ども向けの短いお話を教えてください。`;
  }
  try {
    return await chat(
      [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      { max_tokens: 240, temperature: 0.4 }
    );
  } catch (_) { return ''; }
}

// スポットの史実「事実」を Wikipedia から取得する（子ども向けに整形はしない・素の抜粋＋出典）。
// 説明文ジェネレーターの素材②として使う。戻り値: { facts, source, title } または null。
export async function fetchSpotFacts(spotName, opts = {}) {
  if (!spotName) return null;
  const wikiLang = (LANG === 'en') ? 'en' : 'ja';
  const station = String((opts && opts.station) || '').replace(/駅$|\s*Station$/i, '').trim();
  const query = station ? `${spotName} ${station}` : String(spotName);
  const wiki = await fetchWikipediaExtract(query, spotName, wikiLang);
  if (!wiki || !wiki.extract) return null;
  return { facts: wiki.extract, source: (wikiLang === 'en' ? 'Wikipedia' : 'ウィキペディア'), title: wiki.title };
}

// 「素材①キャラの探検データ × 素材②スポットの史実」を1つの子ども向け説明文へ融合生成する。
// 史実は"解説"として並べず、キャラの性格・好き・あこがれ・とくいに溶かし込む（handoff指示書準拠）。
// 史実(spotFacts)が無ければ融合できないので '' を返し、呼び出し側は従来テンプレへフォールバックする。
export async function generateCharacterBlurb(data = {}) {
  const d = data || {};
  const facts = String(d.spotFacts || '').trim();
  const adventure = String(d.adventure || '').trim();
  const spotName = String(d.spotName || '').trim();
  // 史跡が全く紐づいていない時だけスキップ（＝混ぜる相手がいない）。史実が薄くても場所の雰囲気で融合する。
  if (!spotName) return '';
  let systemPrompt, userPrompt;
  if (LANG === 'en') {
    systemPrompt = `You are the field-guide writer for a kids' town-exploration game. Blend the two materials below into ONE character blurb.
Rules:
1. Do NOT explain the place like a caption. Dissolve it into the character's personality, likes, longing, or talent (e.g. "a mystery writer lived there" -> "loves solving mysteries, looks up to that writer"; "an old quiet temple" -> "loves calm old places").
2. Use specific facts (people, events, years) ONLY if they appear in Material 2. NEVER invent specific names, dates, or events. If Material 2 has little, color the character with the place's TYPE and mood only (e.g. temple = old, quiet, prayer).
3. Kid-friendly. Plain words, 3-4 short sentences, about 200-280 characters.
4. No meta/behind-the-scenes wording ("rises as", "parallel world", etc.). Never explain from outside the story.
5. Start exactly with: "A friend shaped like ${d.animal || 'a little creature'}, whom you met on ${adventure || 'an adventure around town'}." (Never say the friend was "born" or "created" — you MEET/FIND it.)
6. End with one sentence about what the character does for the person who walked with it.
Output: the blurb text only (no headings or notes).`;
    userPrompt = `Material 1 (character):
- Name: ${d.name || ''}
- Adventure phrase (use in the opening): ${adventure || 'an adventure around town'}
- Look / item: ${d.itemHint || '-'}
- Animal / form: ${d.animal || 'a little creature'}
- Personality: ${d.personality || '-'}

Material 2 (the spot):
- Place: ${spotName}
- Known facts (use ONLY these; blank = no confirmed facts): ${facts || '(no confirmed facts — use only the place type/atmosphere, invent nothing specific)'}
- Source: ${d.source || '(none)'}`;
  } else {
    systemPrompt = `あなたは子ども向けまち探検ゲームのキャラ図鑑ライターです。以下の2つの素材を混ぜて、キャラの説明文を1つ作ってください。
ルール：
1. 場所の情報は「解説」として並べず、キャラの性格・好き・あこがれ・とくいに溶かし込む（例：探偵小説家がいた→「なぞときが大すき」「その人にあこがれている」／古くて静かなお寺→「しずかで古い場所が好き」「昔のものにわくわく」）。
2. 具体的な事実（人名・出来事・年号）は、素材②に書かれている時だけ使う。**書かれていない具体的な事実は絶対に創作しない**。素材②が乏しい時は、場所の種類・雰囲気（例：お寺＝古い・静か・祈り）だけを、ふわっと性格に反映する。
3. やさしい言葉で、3〜4文、100〜130字程度。
4. 「〜として立ち上がる」「パラレルワールド」等のメタ表現は禁止。物語の外から説明しない。
5. 冒頭は必ず「${adventure || 'まちをあるいた探検'}で であえた、${d.animal || 'ふしぎな生きもの'}の仲間。」から始める。※「生まれた」「作られた」等は使わない（キャラは"生まれる"のではなく"であう／みつける"）。
6. 最後は、いっしょに歩いた人にキャラが何かしてくれる一文で締める。
出力：説明文の本文のみ（見出しや注釈は不要）。`;
    userPrompt = `素材① キャラの探検データ
- 名前：${d.name || ''}
- 冒頭に使う探検フレーズ：${adventure || 'まちをあるいた探検'}
- 見た目の特徴やアイテム：${d.itemHint || '（とくになし）'}
- 動物・すがた：${d.animal || 'ふしぎな生きもの'}
- 性格タグ：${d.personality || '（とくになし）'}

素材② スポット
- 場所の名前：${spotName}
- わかっている史実（この範囲だけを使う。空＝確かな史実は不明）：${facts || '（確かな史実は不明。場所の種類・雰囲気だけを使い、具体的な事実は創作しない）'}
- 出典：${d.source || '（なし）'}`;
  }
  try {
    const out = await chat(
      [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      { max_tokens: 400, temperature: 0.6 }
    );
    return String(out || '').trim();
  } catch (_) { return ''; }
}

export async function enrichSpotDescription(spotName, category) {
  const catLabel = { historic: '史跡・文化財', sweets: 'スイーツ・お菓子', nature: '自然・公園', toy: '玩具屋', museum: '美術館・博物館', science: '科学館', dagashi: '駄菓子屋' }[category] || 'スポット';
  const prompt = `「${spotName}」（${catLabel}）について、小学生が行きたくなるような紹介文を2文で書いてください。`;
  try {
    return await chat([{ role: 'user', content: prompt }], { max_tokens: 150, temperature: 0.7 });
  } catch (_) { return null; }
}

// 写真の「ひと言メモ」を整形（音声入力のつなぎ言葉・言い淀みを除去）。
export async function tidyMemo(text) {
  const original = (text || '').trim();
  if (!original) return original;

  let systemPrompt;
  if (LANG === 'en') {
    systemPrompt = `You clean up a child's short one-line memo that was written by voice input.
Rules:
1. Remove filler words, hesitations, and repeated words (e.g. "um", "uh", "like", "you know", stutters).
2. Fix obvious speech-to-text mis-recognitions and add natural punctuation.
3. Keep the child's own wording, tone, and vocabulary as much as possible. Do NOT make it sound like an adult.
4. Do NOT add new information, do NOT summarize, do NOT embellish.
5. Keep it short (one or two lines). Output ONLY the cleaned text, with no quotes or extra commentary.`;
  } else {
    systemPrompt = `あなたは、子どもが音声入力で書いた短い「ひと言メモ」を読みやすく整える編集者です。
次のルールを厳守してください。
1. 「えーと」「あの」「なんか」「まあ」「その」などのつなぎ言葉・言い淀み・言葉の繰り返しを取り除く。
2. 音声認識にありがちな明らかな誤変換を直し、読点・句点を自然に整える。
3. 子どもの語り口・素直な表現・語彙はできるだけそのまま残す。大人っぽい文章に書き換えない。
4. 新しい情報を足さない。要約・脚色・言い換えのしすぎをしない。
5. 短く（1〜2行）。整えた本文だけを出力し、かぎかっこや余計な説明は付けない。`;
  }
  const cleaned = await chat(
    [{ role: 'system', content: systemPrompt }, { role: 'user', content: original }],
    { max_tokens: Math.min(400, Math.max(60, original.length * 3)), temperature: 0.2 }
  );
  return cleaned || original;
}

// 録音音声を GAS プロキシ経由で OpenAI Whisper に文字起こしさせる（音声メモ「高精度」）。
export async function transcribeAudio(blob, lang) {
  if (!_drive || typeof _drive.openaiTranscribe !== 'function') throw new Error('AI backend 未設定');
  if (!blob || !blob.size) return '';
  const audioBase64 = await blobToBase64(blob);
  const res = await _drive.openaiTranscribe({ audioBase64, mimeType: blob.type || 'audio/webm', lang });
  return String((res && res.text) || '').trim();
}
