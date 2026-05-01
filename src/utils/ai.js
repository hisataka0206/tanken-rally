// OpenAI API ユーティリティ（PoC: ブラウザから直接呼び出し）
import { LANG } from './i18n.js?v=70';

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
