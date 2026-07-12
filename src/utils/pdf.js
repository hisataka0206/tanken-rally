// 地図PDF生成
// jsPDF 標準フォントは日本語非対応のため、HTML テンプレートを html2canvas で
// ラスタライズしてから jsPDF に貼り込む方式を採用。
// 地図は Google Maps Static API で取得して画像化（html2canvas で Maps タイルが
// CORS の関係で空白になる問題を回避）。

import { toLatLngLiteral } from './maps.js?v=106';
import { apiLang, t, LANG, adjustMinForKids } from './i18n.js?v=106';
import { localizeStationName } from '../data/cities.js?v=106';
import { randomFunCharacterImage } from './characters.js?v=106';

// お楽しみ要素: ストリートビューカードにランダムでキャラを紛れ込ませる確率
const EASTER_EGG_PROBABILITY = 0.1;

// 端末が非力（スマホ / 低メモリ）かどうか。generateMapPdf の冒頭で判定してセットする。
// true のときは html2canvas の解像度を下げ、キャラ画像も出さない（メモリ不足で固まる対策）。
let _pdfConstrained = false;

// bake の結果統計（診断用）。失敗時アラートに載せて落とし穴の位置を可視化する。
let _bakeStats = '';

function detectConstrainedDevice() {
  try {
    const ua = navigator.userAgent || '';
    const isMobile = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(ua)
      || (navigator.maxTouchPoints > 1 && /Mac/.test(ua)); // iPadOS（Macを名乗る）
    // navigator.deviceMemory は上限8・2のべき乗に丸められる粗い指標で、4〜6GB級の
    // 普通のPCも「4」を返す。<=4 だとPCまで遅い(bake)経路に入れてしまうため、
    // 本当に非力な端末だけを拾うよう <=2 にする（判定の主軸は isMobile）。
    const lowMem = typeof navigator.deviceMemory === 'number' && navigator.deviceMemory <= 2;
    return isMobile || lowMem;
  } catch (_) {
    return false;
  }
}

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
 * @param {Function} [opts.onProgress] 進捗コールバック（ステージ文字列を受け取る）
 */
export async function generateMapPdf({ stationName, orderedSpots, stats, origin, directions, apiKey, onProgress }) {
  const progress = msg => { try { if (onProgress) onProgress(msg); } catch (_) {} };
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // 端末判定（スマホ/低メモリ）。以降の解像度とキャラ描画の抑制に使う。
  _pdfConstrained = detectConstrainedDevice();
  console.info(`[pdf] constrained device = ${_pdfConstrained}`);

  // 診断トレース: 各段階の到達時刻を記録し、失敗時にアラートへ出す。
  // スマホでコンソールが見えなくても「どの段階で何秒で止まったか」を掴めるようにする。
  const _t0 = (performance && performance.now) ? performance.now() : Date.now();
  const _trace = [];
  const mark = (s) => {
    const now = (performance && performance.now) ? performance.now() : Date.now();
    _trace.push(`${s}@${Math.round(now - _t0)}ms`);
    console.info(`[pdf] mark ${s} @${Math.round(now - _t0)}ms`);
  };
  _bakeStats = '';
  mark(`start c=${_pdfConstrained}`);

  // 1) 隠し要素に PDF 用 HTML を構築
  const container = buildPdfHtml({ stationName, orderedSpots, stats, origin, directions, apiKey });
  document.body.appendChild(container);
  mark(`html imgs=${container.querySelectorAll('img').length}`);

  try {
    // Static Map / Street View 画像のロード完了を待つ。
    // SV取得失敗（パノラマなし等）の画像は Static Map にフォールバック差し替え。
    progress(t('pdfStageImages', '画像を読込中…'));
    await waitForImagesWithFallback(container);
    mark('imagesWaited');

    // ★スマホ対策: Google の地図/ストリートビュー画像（別ドメイン）を、描画前に
    //   データURL（同一オリジン扱い）へ焼き込む。html2canvas は clone DOM 内で
    //   別ドメイン画像を "もう一度" 取得しに行くため、キャッシュが冷たい1回目は
    //   この再取得がスマホで解決せずハング → 描画タイムアウトで失敗する
    //   （＝「1回目は失敗、2回目はキャッシュ済みで一瞬」の正体）。
    //   bake で全ての別ドメイン画像を data URL 化し、焼けない画像は隠すことで、
    //   html2canvas に外部URLを一切触らせない。PC は desktop Chrome が別ドメイン
    //   再取得で固まらないため従来どおり触らない（bake の負荷も避ける）。
    if (_pdfConstrained) {
      await bakeCrossOriginImages(container);
    }
    mark(`baked ${_bakeStats}`);

    // 2) html2canvas でラスタライズ
    // ★モバイル対策: スマホブラウザには canvas の上限（iOS Safari は約1,677万画素、
    //   1辺は概ね 16,384px まで）があり、超えると描画が固まる・空になる。
    //   コンテンツが長い場合は scale を自動で下げて上限内に収める。
    progress(t('pdfStageRender', '描画中…（少し時間がかかります）'));
    const contentW = container.scrollWidth || 794;
    const contentH = container.scrollHeight || 1;
    // スマホ/低メモリ端末は、巨大キャンバスで html2canvas（描画）が固まるため予算を大きく下げる。
    // ※「描画中…」でフリーズする＝ここが効くポイント。総ピクセル数を絞るほど固まりにくい。
    const MAX_PIXELS    = _pdfConstrained ?  2200000 : 14000000;
    const MAX_DIMENSION = _pdfConstrained ?     6500 :    14000;
    const SCALE_FLOOR   = _pdfConstrained ?      0.5 :      0.9;
    let SCALE = _pdfConstrained ? 1.25 : 2;
    if (contentW * contentH * SCALE * SCALE > MAX_PIXELS) {
      SCALE = Math.max(SCALE_FLOOR, Math.sqrt(MAX_PIXELS / (contentW * contentH)));
    }
    if (contentH * SCALE > MAX_DIMENSION) {
      SCALE = Math.min(SCALE, MAX_DIMENSION / contentH);
    }
    console.info(`[pdf] content=${contentW}x${contentH}px scale=${SCALE.toFixed(2)} constrained=${_pdfConstrained}`);
    mark(`renderStart ${contentW}x${contentH} s=${SCALE.toFixed(2)}`);
    // html2canvas が固まったまま返ってこないケースの保険。一定時間で諦めてエラーにし、
    // 無限フリーズではなくメッセージを出す（呼び出し側でボタンを復帰させる）。
    const RENDER_TIMEOUT_MS = _pdfConstrained ? 90000 : 180000;
    const canvas = await Promise.race([
      html2canvas(container, {
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        scale: SCALE,
        // 保険: 画像は事前に data URL 化済みなので即読めるはずだが、万一外部URLが
        //   残っても html2canvas が長時間ハングしないよう明示的に短めの上限を置く。
        imageTimeout: 15000,
        // ★真因対策: html2canvas はクローンiframeにページの <link>（CSS/フォント）を
        //   丸ごとコピーし、その読み込み完了を待つ。Google Fonts 等の別ドメイン資源は
        //   キャッシュが冷たい1回目にクローン内でコールドfetch → 解決せずハングし、
        //   描画タイムアウト(90秒)で失敗する（＝1回目失敗・2回目一瞬の正体）。
        //   PDF本文はシステムフォント指定なので、クローンから別ドメインの link を
        //   取り除いても見た目は変わらない。これでクローンの別ドメイン読込をゼロにする。
        onclone: (clonedDoc) => {
          try {
            mark('onclone');
            let removed = 0;
            clonedDoc.querySelectorAll('link').forEach(el => {
              const href = el.getAttribute('href') || '';
              if (!href) return;
              let cross = false;
              try { cross = new URL(href, location.href).origin !== location.origin; }
              catch (_) { cross = /^https?:/i.test(href); }
              if (cross) { try { el.parentNode && el.parentNode.removeChild(el); removed++; } catch (_) {} }
            });
            // clone 側にフォント読み込みが残らないよう保険（存在すれば）
            _bakeStats += ` linkRemoved=${removed}`;
            // ★モバイル描画高速化: html2canvas は box-shadow / transform(回転) / filter の
            //   ラスタライズが極端に重い（縦長DOMで90秒ハングの主因）。描画クローンでのみ
            //   これらを無効化して描画コストを大幅に下げる。背景グラデ(background-image)は
            //   見出し帯の視認性に必要なので残す＝見た目はほぼ不変で速度だけ改善。
            if (_pdfConstrained) {
              const st = clonedDoc.createElement('style');
              st.textContent =
                '#pdf-render-root *, #pdf-render-root *::before, #pdf-render-root *::after {' +
                'box-shadow:none !important; text-shadow:none !important; filter:none !important;' +
                'transform:none !important; transition:none !important; animation:none !important; }';
              (clonedDoc.head || clonedDoc.body || clonedDoc.documentElement).appendChild(st);
              _bakeStats += ' lowfx=1';
            }
          } catch (_) { /* noop */ }
        },
      }),
      new Promise((_, reject) => setTimeout(
        () => reject(new Error(t('pdfErrRenderTimeout',
          'PDFの描画に時間がかかりすぎたため中断しました。ルートを短くするか、PCでお試しください。'))),
        RENDER_TIMEOUT_MS
      )),
    ]);
    mark(`renderDone ${canvas.width}x${canvas.height}`);
    if (!canvas.width || !canvas.height) {
      throw new Error('canvas rendering failed (size 0)');
    }
    progress(t('pdfStageWrite', 'PDF書き出し中…'));

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
        // スライスした一時キャンバスを即解放（モバイルのメモリ圧を下げる）
        slice.width = slice.height = 0;
        // ページごとに主スレッドを一瞬手放して UI を固まらせない（＋進捗を更新）
        progress(`${t('pdfStageWrite', 'PDF書き出し中…')} (${pageNum})`);
        await new Promise(r => setTimeout(r, 0));
      }
    }

    mark('saved');
    doc.save(`Tekutan_${stationName}.pdf`);
  } catch (e) {
    // ★診断: 失敗時に「どの段階で止まったか」のトレースをエラーに埋め込む。
    //   スマホでコンソールが見えなくても、アラート文面から落とし穴の位置が分かる。
    mark(`ERROR ${e && e.message ? e.message : e}`);
    const diag = `\n\n[診断] ${_trace.join(' > ')}`;
    if (e instanceof Error) { e.message = (e.message || '') + diag; throw e; }
    throw new Error(String(e) + diag);
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
  wrap.id = 'pdf-render-root';
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
  // お楽しみ要素: たまにキャラクターが写真の隅に紛れ込む（get以外のポーズ）。
  // キャラPNGは同一オリジンなので html2canvas がそのまま扱える（別ドメイン画像の固まり問題とは無関係）。
  let eggHtml = '';
  if (Math.random() < EASTER_EGG_PROBABILITY) {
    const { url } = randomFunCharacterImage();
    const side = Math.random() < 0.5 ? 'left:8px;' : 'right:8px;';
    const rot = (Math.random() * 16 - 8).toFixed(1);
    eggHtml = `<img src="${url}" alt="" style="position:absolute;bottom:6px;${side}height:64px;transform:rotate(${rot}deg);filter:drop-shadow(0 2px 4px rgba(0,0,0,.35));" />`;
  }
  // data-pdf-block を付けることで generateMapPdf の安全分割ロジックが
  // このカードを「割らない」対象として認識する
  return `
    <div data-pdf-block style="border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;page-break-inside:avoid;background:#fff;display:flex;flex-direction:column;">
      <div style="position:relative;">
        <img src="${sv}" alt="streetview" data-fallback="${escapeHtml(fallback)}" crossorigin="anonymous" referrerpolicy="no-referrer-when-downgrade" style="display:block;width:100%;aspect-ratio:3/2;object-fit:cover;background:#eee;border-bottom:1px solid #ddd;" />
        ${eggHtml}
      </div>
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

// 別ドメイン画像（Googleの地図・ストリートビュー等）を data URL に焼き込む。
// html2canvas が clone 内で別ドメイン画像を再取得しようとしてスマホで固まるのを防ぐ。
// 画像は crossorigin=anonymous + CORS 済みで読めているので canvas 経由で data URL 化できる。
// taint 等で失敗した画像は元の src のまま残す（安全側）。
// 個別画像のロード完了を待つ。読めたら true、失敗/タイムアウトは false。
// ★従来は「未ロードの画像はbakeでスキップ→外部URLのまま残り、html2canvasが
//   clone内で再取得してハング」していた。ここで確実に待ってから焼くための保険。
function ensureImageLoaded(img, timeoutMs = 12000) {
  if (img.complete) return Promise.resolve(img.naturalWidth > 0);
  return new Promise(resolve => {
    let done = false;
    const finish = ok => { if (!done) { done = true; resolve(ok); } };
    img.addEventListener('load', () => finish(true), { once: true });
    img.addEventListener('error', () => finish(false), { once: true });
    setTimeout(() => finish(img.complete && img.naturalWidth > 0), timeoutMs);
  });
}

async function bakeCrossOriginImages(root) {
  console.time('[pdf] bakeImages');
  // 別ドメイン画像だけを対象にする。同一オリジンのキャラPNG（透過あり）は焼かない
  // （JPEG化すると透過が白背景になってしまうため & そもそも html2canvas で問題なく扱えるため）。
  // ★重要: ここで complete 判定はしない。未ロードの画像も対象に含め、下で必ず待つ。
  //   （complete で弾くと、間に合わなかった外部画像が焼かれず残り、html2canvas が
  //    clone 内で再取得してスマホでハング→描画タイムアウトになる。これが1回目失敗の主因。）
  const imgs = Array.from(root.querySelectorAll('img')).filter(img => {
    const src = img.currentSrc || img.src || '';
    if (!src || src.startsWith('data:')) return false;
    try { return new URL(src, location.href).origin !== location.origin; }
    catch (_) { return false; }
  });
  // 長辺の上限。これより大きい画像（特に 1280px の Static Map）は縮小してから焼く。
  // フル解像度で toDataURL するとエンコード/再デコード/メモリが重く、体感フリーズの主因になる。
  // モバイルのみ bake するため上限は 1024px（軽さ優先。見た目の劣化はほぼ無い）。
  const MAX_SIDE = 1024;
  let nBaked = 0, nHidden = 0; // 診断用カウンタ
  for (const img of imgs) {
    // まず確実にロード完了を待つ（未ロードなら最大12秒）。
    const loaded = await ensureImageLoaded(img);
    if (!loaded || !img.naturalWidth) {
      // 読めなかった外部画像は隠す。残すと html2canvas が clone で再取得しハングする。
      console.warn('[pdf] bake: 読込不可の外部画像を非表示:', (img.src || '').slice(0, 60));
      img.style.display = 'none';
      nHidden++;
      continue;
    }
    try {
      let w = img.naturalWidth, h = img.naturalHeight;
      const longest = Math.max(w, h);
      if (longest > MAX_SIDE) {
        const r = MAX_SIDE / longest;
        w = Math.max(1, Math.round(w * r));
        h = Math.max(1, Math.round(h * r));
      }
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const cx = c.getContext('2d');
      cx.drawImage(img, 0, 0, w, h); // 必要に応じて縮小描画
      // 地図・SVは不透明なので JPEG でOK（軽い）。透過が要る画像はスマホでは出していない。
      const dataUrl = c.toDataURL('image/jpeg', 0.85);
      c.width = c.height = 0; // 一時キャンバス解放
      img.src = dataUrl;
      nBaked++;
    } catch (e) {
      // ★焼けなかった外部画像は元の src（外部URL）のまま残さず、必ず隠す。
      //   残すと html2canvas が clone 内で外部URLを再取得してハング→1回目失敗の原因になる。
      console.warn('[pdf] bake失敗→非表示:', (img.src || '').slice(0, 60), e && e.message);
      img.style.display = 'none';
      nHidden++;
    }
  }
  // data URL 差し替え後のロードを待つ（data URL は基本即時）
  await waitForImages(root);
  // ★最終保険: ここまでで external(http) のままの img が1つでも残っていたら隠す。
  //   html2canvas に外部URLを一切渡さないことで、clone 内再取得によるハングを構造的に排除。
  let nExtLeft = 0;
  Array.from(root.querySelectorAll('img')).forEach(img => {
    const src = img.currentSrc || img.src || '';
    if (/^https?:/i.test(src)) {
      try {
        if (new URL(src, location.href).origin !== location.origin) {
          console.warn('[pdf] bake後も外部URLが残存→非表示:', src.slice(0, 60));
          img.style.display = 'none';
          nExtLeft++;
        }
      } catch (_) { /* noop */ }
    }
  });
  _bakeStats = `n=${imgs.length} baked=${nBaked} hidden=${nHidden} extLeft=${nExtLeft}`;
  console.timeEnd('[pdf] bakeImages');
}

function waitForImages(root) {
  const imgs = Array.from(root.querySelectorAll('img'));
  return Promise.all(imgs.map(img => {
    // ★重要: complete は「成功」だけでなく「失敗確定」でも true になる。
    // 以前は `complete && naturalWidth > 0` で成功のみ既決扱いにしていたため、
    // 既に失敗が確定した画像（load/error イベントは二度と発火しない）を
    // 永遠に待ち続けるデッドロックがあった（2回目の waitForImages 呼び出し時）。
    if (img.complete) return Promise.resolve();
    return new Promise(resolve => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true }); // 失敗してもPDF生成は続行
      setTimeout(resolve, 20000); // 保険: ネットワーク停滞時も20秒で諦めて続行
    });
  }));
}

// 1次ロード後、失敗した画像があれば data-fallback URL に差し替えて再ロードを待つ
async function waitForImagesWithFallback(root) {
  console.time('[pdf] waitForImages');
  await waitForImages(root);
  const broken = Array.from(root.querySelectorAll('img'))
    .filter(img => (!img.complete || img.naturalWidth === 0) && img.dataset.fallback);
  if (broken.length > 0) {
    console.warn(`[pdf] ${broken.length} streetview画像が失敗 → Static Map にフォールバック`);
    broken.forEach(img => {
      img.src = img.dataset.fallback;
      delete img.dataset.fallback; // 二度目の失敗時は無限ループしないように
    });
    // 差し替え後の画像が読み込まれるのを待つ
    await waitForImages(root);
  }
  // 最終的に読めなかった画像は非表示にする（壊れた画像アイコンがPDFに出ないように）
  Array.from(root.querySelectorAll('img')).forEach(img => {
    if (img.complete && img.naturalWidth === 0) {
      console.warn('[pdf] 読込失敗のため非表示:', (img.src || '').slice(0, 80));
      img.style.display = 'none';
    }
  });
  console.timeEnd('[pdf] waitForImages');
}
