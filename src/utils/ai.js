// OpenAI API ユーティリティ（PoC: ブラウザから直接呼び出し）

export async function fetchOriginStory(stationName, apiKey) {
  // キー未設定時は早期リターン（無駄な401を避け、UI上は静かに無効化）
  if (!apiKey) throw new Error('OPENAI_API_KEY 未設定');

  // 「正確性最優先」プロンプト：
  //   - 確実に知っている場合のみ説明
  //   - 不確かなら必ず「諸説あります」「はっきりしていません」と明記
  //   - 創作・推測で埋めない
  //   - 最後に必ず「※ 諸説あります」を付ける
  const systemPrompt = `あなたは日本の地名の由来を子どもに伝える「たんけん博士」です。
以下のルールを厳守してください：

1. 由来や語源について、自分が確実に知っている情報のみを伝える。
2. はっきりした定説がない場合や知らない場合は、「はっきりした由来はわかっていません」「いくつかの説があります」と正直に書く。
3. 推測で埋めたり、もっともらしい話を創作したりしない。
4. 一般的に語られている説が複数ある場合は「○○という説があります」「△△とも言われています」のように、断定を避ける。
5. 出典が明確な事実（公式の歴史記録など）と、説や言い伝えを区別して書く。
6. 文末に必ず「※ 諸説あります」と付ける。

口調はやさしいですます調。3〜5文。小学校3年生でも分かる言葉で。`;

  const userPrompt = `「${stationName}」という地名・駅名の由来を教えてください。`;

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
  const catLabel = { historic: '史跡・文化財', sweets: 'スイーツ・お菓子', nature: '自然・公園' }[category] || 'スポット';
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
