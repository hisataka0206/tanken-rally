// OpenAI API ユーティリティ（PoC: ブラウザから直接呼び出し）

export async function fetchOriginStory(stationName, apiKey) {
  const prompt = `「${stationName}」という地名の由来を、小学校3年生でも分かる言葉で3〜5文で教えてください。
語源が諸説ある場合は最も有力な説を紹介してください。
「たんけん博士」というキャラクターが話しかけるような口調（ですます調）で書いてください。`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
      temperature: 0.7,
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
