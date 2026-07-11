// OpenAI API ユーティリティ（PoC: ブラウザから直接呼び出し）
import { LANG } from './i18n.js?v=106';

export async function fetchOriginStory(stationName, apiKey) {
  // キー未設定時は早期リターン（無駄な401を避け、UI上は静かに無効化）
  if (!apiKey) throw new Error('OPENAI_API_KEY 未設定');

  // 言語別プロンプト（正確性最優先・諸説併記）
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
    // ja / elementary 共通（elementary は UI 側で振り仮名化）
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

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 350,
      temperature: 0.3,    // 創作を抑えるため低めに
    }),
  });

  if (!res.ok) throw new Error('OpenAI API エラー');
  const data = await res.json();
  return data.choices[0].message.content.trim();
}

export async function enrichSpotDescription(spotName, category, apiKey) {
  const catLabel = { historic: '史跡・文化財', sweets: 'スイーツ・お菓子', nature: '自然・公園', toy: '玩具屋', museum: '美術館・博物館', science: '科学館', dagashi: '駄菓子屋' }[category] || 'スポット';
  const prompt = `「${spotName}」（${catLabel}）について、小学生が行きたくなるような紹介文を2文で書いてください。`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 150,
      temperature: 0.7,
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.choices[0].message.content.trim();
}

// 写真の「ひと言メモ」を OpenAI で整形する。
// 主に音声入力（スマホの音声認識）で紛れ込む無意味語・言い淀み・言葉の繰り返しを
// 取り除いて読みやすくする。子どもの語り口・語彙・素直な表現はできるだけ残し、
// 内容を要約したり新しい情報を足したりはしない。
//
// - text が空/空白のみのときはそのまま返す（API を呼ばない）。
// - apiKey 未設定のときは例外を投げる（呼び出し側で「元のまま」にフォールバック）。
// - API エラー時も例外を投げる（呼び出し側で握りつぶして元テキストを保持する想定）。
export async function tidyMemo(text, apiKey) {
  const original = (text || '').trim();
  if (!original) return original;
  if (!apiKey) throw new Error('OPENAI_API_KEY 未設定');

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
    // ja / elementary 共通（表示側でふりがな化）
    systemPrompt = `あなたは、子どもが音声入力で書いた短い「ひと言メモ」を読みやすく整える編集者です。
次のルールを厳守してください。
1. 「えーと」「あの」「なんか」「まあ」「その」などのつなぎ言葉・言い淀み・言葉の繰り返しを取り除く。
2. 音声認識にありがちな明らかな誤変換を直し、読点・句点を自然に整える。
3. 子どもの語り口・素直な表現・語彙はできるだけそのまま残す。大人っぽい文章に書き換えない。
4. 新しい情報を足さない。要約・脚色・言い換えのしすぎをしない。
5. 短く（1〜2行）。整えた本文だけを出力し、かぎかっこや余計な説明は付けない。`;
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: original },
      ],
      max_tokens: Math.min(400, Math.max(60, original.length * 3)),
      temperature: 0.2,   // 書き換えを最小限にするため低め
    }),
  });

  if (!res.ok) throw new Error('OpenAI API エラー');
  const data = await res.json();
  const cleaned = (data.choices?.[0]?.message?.content || '').trim();
  // 念のため：空が返ってきたら元テキストを保持
  return cleaned || original;
}

// 録音した音声 Blob を OpenAI Whisper で文字起こしする（撮影画面の音声メモ「高精度」方式）。
// - lang は ISO-639-1（'ja' / 'en'）。apiLang() の戻り値をそのまま渡せる。
// - apiKey 未設定時・APIエラー時は例外を投げる（呼び出し側でフォールバック表示）。
export async function transcribeAudio(blob, apiKey, lang) {
  if (!apiKey) throw new Error('OPENAI_API_KEY 未設定');
  if (!blob || !blob.size) return '';

  const ext = (blob.type && blob.type.includes('mp4')) ? 'mp4' : 'webm';
  const form = new FormData();
  form.append('file', blob, `memo.${ext}`);
  form.append('model', 'whisper-1');
  if (lang) form.append('language', lang);   // 認識精度向上のため言語を明示
  // 子どもの短い発話なので、余計な補完を避ける
  form.append('temperature', '0');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      // Content-Type は FormData に任せる（boundary 付与のため手動指定しない）
    },
    body: form,
  });

  if (!res.ok) throw new Error('Whisper API エラー');
  const data = await res.json();
  return (data.text || '').trim();
}
