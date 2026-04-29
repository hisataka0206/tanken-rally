// ユーザーからの不具合報告
//
// 蓄積場所：localStorage（サーバ送信は将来 GAS 連携で追加予定）
// 構造：[{ at, types: [...], detail, context: { stationName, ... }, ua }]

const STORE_KEY = 'tanken-rally:issue-reports:v1';

export function listReports() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function addReport({ types = [], detail = '', context = {} }) {
  if (types.length === 0 && !detail.trim()) {
    throw new Error('種類を1つ以上選ぶか、詳しい内容を書いてね。');
  }
  const list = listReports();
  list.push({
    at: new Date().toISOString(),
    types,
    detail: detail.trim(),
    context,
    ua: navigator.userAgent,
    href: location.href,
  });
  // 直近100件まで保持（古いのは捨てる）
  while (list.length > 100) list.shift();
  localStorage.setItem(STORE_KEY, JSON.stringify(list));
  // 開発者向け：コンソールにも出力
  console.info('[issue-report] 受付ました:', list[list.length - 1]);
  return list[list.length - 1];
}

export function clearReports() {
  localStorage.removeItem(STORE_KEY);
}
