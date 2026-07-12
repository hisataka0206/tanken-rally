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
