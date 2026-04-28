// 地図PDF生成
// jsPDF 標準フォントは日本語非対応のため、HTML テンプレートを html2canvas で
// ラスタライズしてから jsPDF に貼り込む方式を採用。
// 地図は Google Maps Static API で取得して画像化（html2canvas で Maps タイルが
// CORS の関係で空白になる問題を回避）。

import { toLatLngLiteral } from './maps.js?v=17';

const A4 = { wMm: 210, hMm: 297 };
const MARGIN_MM = 10;

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
    // Static Map 画像のロード完了を待つ
    await waitForImages(container);

    // 2) html2canvas でラスタライズ
    const canvas = await html2canvas(container, {
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      scale: 2,
    });

    // 3) jsPDF に画像として配置（A4 幅にフィット、必要に応じて複数ページに分割）
    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    const pageInnerW = A4.wMm - MARGIN_MM * 2;
    const pageInnerH = A4.hMm - MARGIN_MM * 2;
    const imgWidthMm = pageInnerW;
    const imgHeightMm = (canvas.height * imgWidthMm) / canvas.width;

    if (imgHeightMm <= pageInnerH) {
      doc.addImage(imgData, 'JPEG', MARGIN_MM, MARGIN_MM, imgWidthMm, imgHeightMm);
    } else {
      // 縦長の場合はキャンバスをスライスして複数ページに展開
      const pageHeightPx = (pageInnerH * canvas.width) / pageInnerW;
      let offsetPx = 0;
      let pageNum = 0;
      while (offsetPx < canvas.height) {
        const sliceHeight = Math.min(pageHeightPx, canvas.height - offsetPx);
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
  const today = new Date().toLocaleDateString('ja-JP');

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

  const catLabel = c => ({ historic: '🏯 史跡・文化財', sweets: '🍰 スイーツ', nature: '🌿 公園・自然' }[c] || '📍 その他');

  wrap.innerHTML = `
    <div style="background:#004029;color:#fff;padding:12px 20px;border-radius:8px 8px 0 0;display:flex;align-items:center;justify-content:space-between;">
      <div>
        <div style="font-size:20px;font-weight:700;letter-spacing:.05em;">🗺️ たんけんラリー</div>
        <div style="font-size:12px;margin-top:2px;opacity:.95;">${escapeHtml(stationName)} 探検マップ</div>
      </div>
      <div style="font-size:11px;opacity:.85;">${today}</div>
    </div>

    <div style="display:flex;gap:18px;background:#f5f0e8;padding:8px 20px;border-radius:0 0 8px 8px;font-size:12px;">
      <div><span style="color:#666;">総距離</span> <strong style="font-size:14px;color:#004029;">${escapeHtml(stats?.distanceText || '-')}</strong></div>
      <div><span style="color:#666;">推定時間</span> <strong style="font-size:14px;color:#004029;">約${stats?.durationMin ?? '-'}分</strong></div>
      <div><span style="color:#666;">スポット数</span> <strong style="font-size:14px;color:#004029;">${orderedSpots.length}件</strong></div>
    </div>

    <div style="margin-top:12px;border:1px solid #ddd;border-radius:8px;overflow:hidden;">
      ${mapImgUrl
        ? `<img src="${mapImgUrl}" alt="map" crossorigin="anonymous" style="display:block;width:100%;" />`
        : `<div style="padding:80px 24px;text-align:center;color:#888;background:#f4f4f4;">（地図画像はAPIキー未設定のため省略）</div>`}
    </div>

    <div style="margin-top:22px;background:#004029;color:#fff;padding:8px 16px;border-radius:6px;font-weight:700;font-size:15px;">
      たんけんルート
    </div>

    <div style="margin-top:8px;">
      ${buildRouteFlowHtml({ stationName, orderedSpots, directions, catLabel })}
    </div>

    <div style="margin-top:24px;text-align:center;font-size:11px;color:#999;border-top:1px solid #eee;padding-top:10px;">
      たんけんラリー — ${escapeHtml(stationName)} 探検マップ
    </div>
  `;

  return wrap;
}

// 「駅(S) → 区間 → スポット1 → 区間 → ... → スポットN → 区間 → 駅(G)」のHTML
function buildRouteFlowHtml({ stationName, orderedSpots, directions, catLabel }) {
  const legs = directions?.routes?.[0]?.legs || [];
  const legHtml = (leg) => {
    if (!leg) return '';
    const min = Math.max(1, Math.round(leg.duration.value / 60));
    return `
      <div style="display:flex;align-items:center;gap:8px;margin-left:14px;padding:6px 0 6px 22px;border-left:2px dashed #bdbdbd;font-size:12px;color:#777;">
        <span style="font-size:14px;">🚶</span>
        <span>約 ${min}分・${escapeHtml(leg.distance.text)}</span>
      </div>`;
  };
  const stationItem = (label, color) => `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:#f0f7f0;border-radius:6px;margin:4px 0;">
      <div style="flex-shrink:0;width:30px;height:30px;background:${color};color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.25);">
        ${label}
      </div>
      <div style="flex:1;">
        <div style="font-weight:700;font-size:14px;">🚉 ${escapeHtml(stationName)}駅 <span style="font-size:11px;color:#666;">（${label === 'S' ? 'スタート' : 'ゴール'}）</span></div>
      </div>
    </div>`;
  const spotItem = (s, i) => `
    <div style="display:flex;align-items:flex-start;gap:12px;padding:10px 4px;">
      <div style="flex-shrink:0;width:28px;height:28px;background:#004029;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.25);">
        ${i + 1}
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

function buildStaticMapUrl({ origin, orderedSpots, directions, apiKey }) {
  if (!apiKey) return null;
  const o = toLatLngLiteral(origin);
  const params = [
    'size=640x640',          // 正方形・大型化（実質1280x1280 @ scale=2）
    'scale=2',
    'maptype=roadmap',
    'language=ja',
    // zoom / center は markers / path から auto-fit で算出させる
  ];
  // 駅マーカー
  if (o) params.push(`markers=color:0x004029|label:S|${o.lat},${o.lng}`);
  // 各スポット（番号ラベル 1〜0、最大10件）
  const labels = ['1','2','3','4','5','6','7','8','9','0'];
  orderedSpots.slice(0, labels.length).forEach((s, i) => {
    params.push(`markers=color:red|label:${labels[i]}|${s.lat},${s.lng}`);
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
