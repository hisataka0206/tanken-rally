// 地図PDF生成
// jsPDF 標準フォントは日本語非対応のため、HTML テンプレートを html2canvas で
// ラスタライズしてから jsPDF に貼り込む方式を採用。
// 地図は Google Maps Static API で取得して画像化（html2canvas で Maps タイルが
// CORS の関係で空白になる問題を回避）。

import { toLatLngLiteral } from './maps.js?v=89';
import { apiLang, t, LANG, adjustMinForKids } from './i18n.js?v=89';
import { localizeStationName } from '../data/cities.js?v=89';

const A4 = { wMm: 210, hMm: 297 };
const MARGIN_MM = 10;

// スポット番号を A,B,C... のラベルに変換（地図・ルート・曲がり角で一貫使用）
// 27件目以降はフォールバックで数字を返す（実用上ありえない件数だが念のため）
const SPOT_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const spotLetter = i => SPOT_LETTERS[i] || String(i + 1);

/**
 * @param {Object} opts
 * @param {string} opts.stationName
 * @param {Array}  opts.orderedSpots [{ name, address, lat, lng, category }]
 * @param {Object} opts.stats { distanceText, durationMin }
 * @param {Object} opts.origin       駅の座標（LatLng or { lat, lng }）
 * @param {Object} opts.directions   Directions API の結果（routes[0].overview_polyline を使う）
 * @param {string} opts.apiKey       Maps Static API キー
 */
export async function generateMapPdf({ stationName, orderedSpots, stats, origin, directions, apiKey }) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // 1) 隠し要素に PDF 用 HTML を構築
  const container = buildPdfHtml({ stationName, orderedSpots, stats, origin, directions, apiKey });
  document.body.appendChild(container);

  try {
    // Static Map / Street View 画像のロード完了を待つ。
    // SV取得失敗（パノラマなし等）の画像は Static Map にフォールバック差し替え。
    await waitForImagesWithFallback(container);

    // 2) html2canvas でラスタライズ
    const SCALE = 2;
    const canvas = await html2canvas(container, {
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      scale: SCALE,
    });

    // 2.5) ページ分割時に「割らない方が良い」ブロックの Y 範囲を取得
    //      （getBoundingClientRect は CSS pixel 単位なので scale 倍してキャンバス座標へ）
    const containerRect = container.getBoundingClientRect();
    const blockSelectors = [
      '.report-photo-item',                  // 「曲がるところ」のカード
      '[data-pdf-block]',                    // 任意で「割らない」と指定したブロック
    ].join(',');
    const blockRanges = Array.from(container.querySelectorAll(blockSelectors)).map(el => {
      const r = el.getBoundingClientRect();
      return {
        top: (r.top - containerRect.top) * SCALE,
        bottom: (r.bottom - containerRect.top) * SCALE,
      };
    }).sort((a, b) => a.top - b.top);

    // 与えられた desired Y で分割するとブロックを割ってしまう場合、
    // そのブロックの上端まで戻して安全に分割。lowerBound + minAdvance より上には戻らない。
    const findSafeSplit = (desired, lowerBound) => {
      const minAdvance = 200; // 200px = ページの数%。これより小さい slice は作らない
      let cutAt = desired;
      for (const r of blockRanges) {
        if (r.top < desired && r.bottom > desired) {
          if (r.top > lowerBound + minAdvance && r.top < cutAt) {
            cutAt = r.top;
          }
        }
      }
      return cutAt;
    };

    // 3) jsPDF に画像として配置（A4 幅にフィット、必要に応じて複数ページに分割）
    const pageInnerW = A4.wMm - MARGIN_MM * 2;
    const pageInnerH = A4.hMm - MARGIN_MM * 2;
    const imgWidthMm = pageInnerW;
    const imgHeightMm = (canvas.height * imgWidthMm) / canvas.width;

    if (imgHeightMm <= pageInnerH) {
      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      doc.addImage(imgData, 'JPEG', MARGIN_MM, MARGIN_MM, imgWidthMm, imgHeightMm);
    } else {
      // 縦長 → キャンバスをスライスして複数ページに展開
      const pageHeightPx = (pageInnerH * canvas.width) / pageInnerW;
      let offsetPx = 0;
      let pageNum = 0;
      while (offsetPx < canvas.height) {
        const remaining = canvas.height - offsetPx;
        let sliceHeight;
        if (remaining <= pageHeightPx) {
          // 最後のページ：残り全部
          sliceHeight = remaining;
        } else {
          // 通常ページ：割らないブロックを跨がない位置で切る
          const desired = offsetPx + pageHeightPx;
          const safeY = findSafeSplit(desired, offsetPx);
          sliceHeight = safeY - offsetPx;
        }
        const slice = document.createElement('canvas');
        slice.width = canvas.width;
        slice.height = sliceHeight;
        const ctx = slice.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, slice.width, slice.height);
        ctx.drawImage(canvas, 0, -offsetPx);
        const sliceData = slice.toDataURL('image/jpeg', 0.92);
        const sliceMm = (sliceHeight * imgWidthMm) / canvas.width;
        if (pageNum > 0) doc.addPage();
        doc.addImage(sliceData, 'JPEG', MARGIN_MM, MARGIN_MM, imgWidthMm, sliceMm);
        offsetPx += sliceHeight;
        pageNum++;
      }
    }

    doc.save(`たんけんラリー_${stationName}.pdf`);
  } finally {
    container.remove();
  }
}

// ===== 内部ヘルパー =====

function buildPdfHtml({ stationName, orderedSpots, stats, origin, directions, apiKey }) {
  const today = new Date().toLocaleDateString(LANG === 'en' ? 'en-US' : 'ja-JP');
  const localStation = localizeStationName(stationName, LANG);

  // PDF 用の隠しコンテナ（A4 幅相当 = 794px ≒ 210mm @96dpi）
  const wrap = document.createElement('div');
  wrap.style.cssText = `
    position: fixed;
    top: -10000px;
    left: 0;
    width: 794px;
    background: #ffffff;
    color: #1a1a1a;
    font-family: 'Hiragino Kaku Gothic ProN', 'Yu Gothic', 'Meiryo', sans-serif;
    padding: 32px 40px;
    box-sizing: border-box;
  `;

  const mapImgUrl = buildStaticMapUrl({ origin, orderedSpots, directions, apiKey });

  const ICONS = { historic: '🏯', sweets: '🍰', nature: '🌿', toy: '🧸', museum: '🎨', science: '🔬', dagashi: '🍬', other: '📍' };
  const catLabel = c => `${ICONS[c] || '📍'} ${t(`catLabel_${c}`, t('catLabel_other'))}`;

  wrap.innerHTML = `
    <div style="background:#004029;color:#fff;padding:12px 20px;border-radius:8px 8px 0 0;display:flex;align-items:center;justify-content:space-between;">
      <div>
        <div style="font-size:20px;font-weight:700;letter-spacing:.05em;">🗺️ ${escapeHtml(t('appTitle'))}</div>
        <div style="font-size:12px;margin-top:2px;opacity:.95;">${escapeHtml(t('pdfStationLabel').replace('{name}', localStation))}</div>
      </div>
      <div style="font-size:11px;opacity:.85;">${today}</div>
    </div>

    <div style="display:flex;gap:18px;background:#f5f0e8;padding:8px 20px;border-radius:0 0 8px 8px;font-size:12px;">
      <div><span style="color:#666;">${escapeHtml(t('statsTotalDistance'))}</span> <strong style="font-size:14px;color:#004029;">${escapeHtml(stats?.distanceText || '-')}</strong></div>
      <div><span style="color:#666;">${escapeHtml(t('statsEstTime'))}</span> <strong style="font-size:14px;color:#004029;">${escapeHtml(t('approxMin').replace('{n}', adjustMinForKids(stats?.durationMin) ?? '-'))}</strong>${LANG === 'elementary' ? `<span style="color:#999;font-size:10px;margin-left:4px;">${escapeHtml(t('kidsTimeNote'))}</span>` : ''}</div>
      <div><span style="color:#666;">${escapeHtml(t('statsSpotCount'))}</span> <strong style="font-size:14px;color:#004029;">${orderedSpots.length}${escapeHtml(t('suffSpots'))}</strong></div>
    </div>

    ${(() => {
      // 駅の出口情報（Directions の最初のステップから抽出）
      const exit = extractStationExit(directions);
      if (!exit) return '';
      return `
        <div style="margin-top:10px;padding:10px 16px;background:#fffbe5;border:1.5px solid #f4d35e;border-radius:8px;font-size:14px;color:#5d4037;font-weight:600;">
          ${escapeHtml(t('pdfStationExitFmt').replace('{exit}', exit))}
        </div>
      `;
    })()}

    <div data-pdf-block style="margin-top:12px;border:1px solid #ddd;border-radius:8px;overflow:hidden;">
      ${mapImgUrl
        ? `<img src="${mapImgUrl}" alt="map" crossorigin="anonymous" referrerpolicy="no-referrer-when-downgrade" style="display:block;width:100%;" />`
        : `<div style="padding:80px 24px;text-align:center;color:#888;background:#f4f4f4;">${escapeHtml(t('pdfNoApiKey'))}</div>`}
    </div>

    <div style="margin-top:22px;background:#004029;color:#fff;padding:8px 16px;border-radius:6px;font-weight:700;font-size:15px;">
      ${escapeHtml(t('pdfSecRoute'))}
    </div>

    <div style="margin-top:8px;">
      ${buildRouteFlowHtml({ stationName, localStation, orderedSpots, directions, catLabel })}
    </div>

    <div style="margin-top:24px;background:#004029;color:#fff;padding:8px 16px;border-radius:6px;font-weight:700;font-size:15px;">
      ${escapeHtml(t('pdfSecTurnpoints'))}
    </div>
    <div style="margin-top:6px;font-size:11px;color:#666;line-height:1.5;">
      ${escapeHtml(t('pdfTurnHint'))}
    </div>
    <div style="margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:10px;">
      ${buildTurnPointsHtml({ stationName, localStation, origin, orderedSpots, directions, apiKey })}
    </div>

    <div style="margin-top:24px;text-align:center;font-size:11px;color:#999;border-top:1px solid #eee;padding-top:10px;">
      ${escapeHtml(t('pdfFooter').replace('{name}', localStation))}
    </div>
  `;

  return wrap;
}

// 「駅(S) → 区間 → スポット1 → 区間 → ... → スポットN → 区間 → 駅(G)」のHTML
function buildRouteFlowHtml({ stationName, localStation, orderedSpots, directions, catLabel }) {
  const legs = directions?.routes?.[0]?.legs || [];
  const legHtml = (leg) => {
    if (!leg) return '';
    const rawMin = Math.max(1, Math.round(leg.duration.value / 60));
    const min = adjustMinForKids(rawMin);
    return `
      <div style="display:flex;align-items:center;gap:8px;margin-left:14px;padding:6px 0 6px 22px;border-left:2px dashed #bdbdbd;font-size:12px;color:#777;">
        <span style="font-size:14px;">🚶</span>
        <span>${escapeHtml(t('approxMinKm').replace('{min}', min).replace('{km}', leg.distance.text))}</span>
      </div>`;
  };
  const stationName2 = localStation || stationName;
  const stationItem = (label, color) => {
    const tpl = label === 'S' ? t('pdfFlowStart') : t('pdfFlowGoal');
    const html = tpl.replace('{name}', escapeHtml(stationName2));
    return `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:#f0f7f0;border-radius:6px;margin:4px 0;">
      <div style="flex-shrink:0;width:30px;height:30px;background:${color};color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.25);">
        ${label}
      </div>
      <div style="flex:1;">
        <div style="font-weight:700;font-size:14px;">${html}</div>
      </div>
    </div>`;
  };
  const spotItem = (s, i) => `
    <div style="display:flex;align-items:flex-start;gap:12px;padding:10px 4px;">
      <div style="flex-shrink:0;width:32px;height:32px;background:#c62828;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.25);">
        ${spotLetter(i)}
      </div>
      <div style="flex:1;">
        <div style="font-weight:700;font-size:14px;">${escapeHtml(s.name)}</div>
        <div style="font-size:11px;color:#999;margin-top:2px;">${catLabel(s.category)}</div>
        <div style="font-size:11px;color:#666;margin-top:3px;line-height:1.4;">${escapeHtml(s.address || '')}</div>
      </div>
    </div>`;

  const parts = [stationItem('S', '#2e7d32')];
  orderedSpots.forEach((s, i) => {
    parts.push(legHtml(legs[i]));
    parts.push(spotItem(s, i));
  });
  parts.push(legHtml(legs[legs.length - 1]));
  parts.push(stationItem('G', '#c62828'));
  return parts.join('');
}

// ===== 曲がる場所＋ランドマーク（ストリートビュー）=====
//
// Directions API の各 leg.steps[] の中で、maneuver が設定されているものが
// 「曲がるところ」。各 step.start_location でストリートビューを取得して、
// 進行方向を heading として渡すことで、曲がった先の風景が映るようにする。
function buildTurnPointsHtml({ stationName, localStation, origin, orderedSpots, directions, apiKey }) {
  if (!apiKey) {
    return `<div style="padding:14px;background:#f5f0e8;border-radius:6px;font-size:12px;color:#666;">${escapeHtml(t('pdfNoApiKey'))}</div>`;
  }
  const legs = directions?.routes?.[0]?.legs || [];
  if (legs.length === 0) return '';
  const stationDisp = localStation || stationName;
  const o = toLatLngLiteral(origin);

  // 区間ヘッダー（左右2カラムをまたぐワイドな帯）。grid-column: 1 / -1 で全幅を占有。
  // data-pdf-block を付けてページ境界で割られないようにする。
  const segmentHeader = ({ from, to, fromName, toName }) => {
    const text = t('pdfSegmentHeaderFmt')
      .replace('{from}', from).replace('{to}', to)
      .replace('{fromName}', fromName).replace('{toName}', toName);
    return `
      <div data-pdf-block style="grid-column:1/-1;margin:14px 0 4px;padding:10px 18px;background:linear-gradient(90deg,#004029 0%,#2e7d32 100%);color:#fff;border-radius:8px;font-weight:700;font-size:14px;letter-spacing:.04em;box-shadow:0 2px 5px rgba(0,0,0,.18);">
        ${escapeHtml(text)}
      </div>
    `;
  };

  // 「この区間は曲がり角なし」のプレースホルダ（grid-column:1/-1 で帯化）
  const noTurnsRow = () => `
    <div data-pdf-block style="grid-column:1/-1;padding:10px 16px;background:#f5f0e8;color:#888;font-size:12px;border-radius:6px;">
      ${escapeHtml(t('pdfSegmentNoTurns'))}
    </div>
  `;

  // 出発地点：駅 → 1つ目のスポット方向のストリートビュー
  const cards = [];
  const firstStep = legs[0]?.steps?.[0];
  if (o && firstStep) {
    const endLoc = toLatLngLiteral(firstStep.end_location);
    const heading = endLoc ? computeHeading(o, endLoc) : 0;
    cards.push(buildTurnCard({
      label: 'S',
      labelColor: '#2e7d32',
      title: t('pdfStartCardTitle').replace('{name}', stationDisp),
      subtitle: t('pdfStartCardSubtitle'),
      icon: '🚉',
      lat: o.lat,
      lng: o.lng,
      heading,
      apiKey,
    }));
  }

  // 各 leg を「区間ヘッダー + 区間内の曲がり角カード群」として出力
  let globalTurnCount = 0;
  legs.forEach((leg, legIdx) => {
    const fromLabel = legIdx === 0 ? 'S' : spotLetter(legIdx - 1);
    const toLabel   = legIdx < orderedSpots.length ? spotLetter(legIdx) : 'G';
    const fromName  = legIdx === 0 ? stationDisp : orderedSpots[legIdx - 1].name;
    const toName    = legIdx < orderedSpots.length ? orderedSpots[legIdx].name : stationDisp;
    const nextRaw   = `${toLabel} (${toName})`;

    cards.push(segmentHeader({
      from: fromLabel, to: toLabel,
      fromName, toName,
    }));

    let turnsInThisLeg = 0;
    (leg.steps || []).forEach(step => {
      if (!step.maneuver) return;
      if (step.maneuver === 'straight') return;
      globalTurnCount++;
      turnsInThisLeg++;
      const start = toLatLngLiteral(step.start_location);
      const end = toLatLngLiteral(step.end_location);
      const heading = (start && end) ? computeHeading(start, end) : 0;
      const rawMin = Math.max(1, Math.round((step.duration?.value || 0) / 60));
      const min = adjustMinForKids(rawMin);
      const distText = step.distance?.text || '';
      // 区間情報を含めた subtitle: 距離・時間 + 次の目的地（A,B,C 表記）
      const subtitleHtml =
        `${escapeHtml(distText)}・${escapeHtml(t('approxMinDot').replace('{min}', min))} ` +
        `${escapeHtml(t('pdfNextDirection').replace('{name}', nextRaw))}`;
      cards.push(buildTurnCard({
        label: String(globalTurnCount),
        labelColor: '#004029',
        title: stripHtml(step.html_instructions || step.instructions || ''),
        subtitle: subtitleHtml,
        icon: maneuverIcon(step.maneuver),
        lat: start?.lat,
        lng: start?.lng,
        heading,
        apiKey,
      }));
    });
    if (turnsInThisLeg === 0) cards.push(noTurnsRow());
  });

  // ゴール地点
  const lastLeg = legs[legs.length - 1];
  const lastStep = lastLeg?.steps?.[lastLeg.steps.length - 1];
  if (lastStep && o) {
    const endLoc = toLatLngLiteral(lastStep.end_location);
    if (endLoc) {
      cards.push(buildTurnCard({
        label: 'G',
        labelColor: '#c62828',
        title: t('pdfGoalCardTitle').replace('{name}', stationDisp),
        subtitle: t('pdfGoalCardSubtitle'),
        icon: '🏁',
        lat: endLoc.lat,
        lng: endLoc.lng,
        heading: computeHeading(endLoc, o),
        apiKey,
      }));
    }
  }

  if (cards.length === 0) {
    return `<div style="padding:14px;background:#f5f0e8;border-radius:6px;font-size:12px;color:#666;">${escapeHtml(t('pdfNoTurns'))}</div>`;
  }

  return cards.join('');
}

function buildTurnCard({ label, labelColor, title, subtitle, icon, lat, lng, heading, apiKey }) {
  // Street View Static API:
  //   - 大きめの 480x320 で取得（PDF出力時に綺麗に見える）
  //   - radius=100 でデフォルトの 50m → 100m に拡大（パノラマがない場所のヒット率向上）
  //   - source=outdoor で屋外のみを対象（地下道・屋内の謎SVを除外）
  const sv = `https://maps.googleapis.com/maps/api/streetview?size=480x320&location=${lat},${lng}&heading=${Math.round(heading)}&fov=90&pitch=0&radius=100&source=outdoor&key=${apiKey}`;
  // フォールバック：SV取得失敗時に表示する Static Map（地点中心、ズーム18、マーカー付き）
  const fallback = `https://maps.googleapis.com/maps/api/staticmap?size=480x320&scale=2&center=${lat},${lng}&zoom=18&markers=color:red%7Csize:mid%7C${lat},${lng}&maptype=roadmap&language=${apiLang()}&key=${apiKey}`;
  // data-pdf-block を付けることで generateMapPdf の安全分割ロジックが
  // このカードを「割らない」対象として認識する
  return `
    <div data-pdf-block style="border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;page-break-inside:avoid;background:#fff;display:flex;flex-direction:column;">
      <img src="${sv}" alt="streetview" data-fallback="${escapeHtml(fallback)}" crossorigin="anonymous" referrerpolicy="no-referrer-when-downgrade" style="display:block;width:100%;aspect-ratio:3/2;object-fit:cover;background:#eee;border-bottom:1px solid #ddd;" />
      <div style="padding:8px 10px;font-size:12px;line-height:1.5;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
          <div style="flex-shrink:0;width:24px;height:24px;background:${labelColor};color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;border:2px solid white;box-shadow:0 1px 2px rgba(0,0,0,.2);">${escapeHtml(label)}</div>
          <div style="font-size:18px;line-height:1;">${icon}</div>
          <div style="font-weight:700;color:#222;font-size:13px;flex:1;min-width:0;word-break:break-word;">${escapeHtml(title)}</div>
        </div>
        <div style="font-size:11px;color:#666;padding-left:32px;line-height:1.5;">${subtitle}</div>
      </div>
    </div>
  `;
}

// 曲がる方向の絵文字アイコン
function maneuverIcon(m) {
  if (!m) return '🚶';
  if (m.includes('uturn')) return '↩️';
  if (m.includes('sharp-right')) return '↘️';
  if (m.includes('sharp-left')) return '↙️';
  if (m.includes('slight-right')) return '↗️';
  if (m.includes('slight-left')) return '↖️';
  if (m.includes('right')) return '➡️';
  if (m.includes('left')) return '⬅️';
  if (m.includes('roundabout')) return '🔄';
  if (m.includes('merge')) return '⤴️';
  if (m.includes('fork')) return '⑂';
  return '🚶';
}

// 2点間の方位角（北を0度として時計回り、度）
function computeHeading(from, to) {
  if (!from || !to) return 0;
  const dLng = (to.lng - from.lng) * Math.PI / 180;
  const lat1 = from.lat * Math.PI / 180;
  const lat2 = to.lat * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

// HTML タグ（Directions API の instructions に含まれる <b>, <div> など）を除去
function stripHtml(html) {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return (tmp.textContent || tmp.innerText || '').trim();
}

// Directions API のレスポンスから「出口情報」を抽出する。
// routes[0].legs[0].steps[0..2] あたりの instructions に「○番出口」「○口」が
// 含まれていればそれを返す。Google が公式に推奨する出口なので確度が高い。
//   - 「8番出口」「ハチ公口」「南口」「中央口」など多様な表現に対応
//   - 見つからなければ null（呼び出し側で表示自体をスキップ）
function extractStationExit(directions) {
  const legs = directions?.routes?.[0]?.legs;
  if (!legs || !legs.length) return null;
  // 最初のレグ（駅 → 最初のスポット）の最初の数ステップを見る
  const firstLegSteps = legs[0]?.steps || [];
  const candidates = firstLegSteps.slice(0, 3); // 多くは1〜2ステップ目までに出る
  for (const step of candidates) {
    const text = stripHtml(step.html_instructions || step.instructions || '');
    if (!text) continue;
    // 1) 番号付き出口（最も確実）: "8番出口", "12番出口"
    const numbered = text.match(/(\d+番出口)/);
    if (numbered) return numbered[1];
    // 2) 名前付き出口: "ハチ公口", "丸の内中央口", "南口", "東改札口" など
    //    "口" の前に駅名や"出"が付くもの（例: 出口、改札口、地下鉄口）は除外
    const named = text.match(/([一-龯ぁ-んァ-ヶー]{2,8}口)(?=を|から|に|・|、|。|\s|$)/);
    if (named) {
      const w = named[1];
      // ノイズ除去：これ自体がただの「出口」「改札口」などの一般語の場合はスキップ
      if (w === '出口' || w === '改札口' || w === '入口' || w === '入り口') continue;
      return w;
    }
  }
  return null;
}

function buildStaticMapUrl({ origin, orderedSpots, directions, apiKey }) {
  if (!apiKey) return null;
  const o = toLatLngLiteral(origin);
  const params = [
    'size=640x640',          // 正方形・大型化（実質1280x1280 @ scale=2）
    'scale=2',
    'maptype=roadmap',
    `language=${apiLang()}`,
    // zoom / center は markers / path から auto-fit で算出させる
  ];
  // 駅マーカー
  if (o) params.push(`markers=color:0x004029|label:S|${o.lat},${o.lng}`);
  // 各スポット（A,B,C... のアルファベット表記、最大26件）
  orderedSpots.slice(0, SPOT_LETTERS.length).forEach((s, i) => {
    params.push(`markers=color:red|label:${spotLetter(i)}|${s.lat},${s.lng}`);
  });
  // パス：徒歩経路の encoded polyline 優先（Directions API の overview_polyline）
  // フォールバックは点を直線で結ぶ
  const enc = directions?.routes?.[0]?.overview_polyline;
  if (enc) {
    // Static Maps の path=enc:... 形式。encoded string にはバックスラッシュ等が含まれるので encodeURIComponent
    params.push(`path=color:0x004029ff|weight:5|enc:${encodeURIComponent(enc)}`);
  } else {
    const path = [o, ...orderedSpots.map(s => ({ lat: s.lat, lng: s.lng }))]
      .filter(Boolean)
      .map(p => `${p.lat},${p.lng}`)
      .join('|');
    if (path) params.push(`path=color:0x004029ff|weight:4|${path}`);
  }
  params.push(`key=${apiKey}`);
  return `https://maps.googleapis.com/maps/api/staticmap?${params.join('&')}`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function waitForImages(root) {
  const imgs = Array.from(root.querySelectorAll('img'));
  return Promise.all(imgs.map(img => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    return new Promise(resolve => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true }); // 失敗してもPDF生成は続行
    });
  }));
}

// 1次ロード後、失敗した画像があれば data-fallback URL に差し替えて再ロードを待つ
async function waitForImagesWithFallback(root) {
  await waitForImages(root);
  const broken = Array.from(root.querySelectorAll('img'))
    .filter(img => (!img.complete || img.naturalWidth === 0) && img.dataset.fallback);
  if (broken.length === 0) return;
  console.warn(`[pdf] ${broken.length} streetview画像が失敗 → Static Map にフォールバック`);
  broken.forEach(img => {
    img.src = img.dataset.fallback;
    delete img.dataset.fallback; // 二度目の失敗時は無限ループしないように
  });
  // 差し替え後の画像が読み込まれるのを待つ
  await waitForImages(root);
}
