// 画像エフェクト: 生成画像（不透明背景）の背景を透過に抜く。
// キャラ自動生成では Gemini が不透明背景の画像を返すため、
//   - シルエット表示（brightness(0)）が「黒い長方形」になる
//   - reveal / 図鑑 / AR で「箱に入った絵」に見える
// を防ぐために、四隅からのフラッドフィルで背景色に連結した領域だけを透過にする。
// フラッドフィル方式なのでキャラ内部の同色（白ハイライト等）は消えない。

// 中央値（外れ値=隅のノイズに強い）
function median(arr) {
  if (!arr.length) return 0;
  const a = arr.slice().sort((x, y) => x - y);
  return a[a.length >> 1];
}

/**
 * 背景がおおむね均一な画像の背景を透過PNG(dataURL)にして返す。
 * 外周全体をシードにしたフラッドフィル＋外周ピクセルの中央値を背景色に使う
 * （隅のノイズ・小さなフレームに強い）。連結成分のみ透過＝キャラ内部の同色は保持。
 * 失敗時は元 dataUrl を返す（安全側）。
 * @param {string} dataUrl 元画像
 * @param {{tolerance?:number}} opts tolerance=色距離しきい値(0-441)
 * @returns {Promise<{url:string, removedRatio:number}>}
 *   removedRatio=透過にできた画素割合（低い＝背景が抜けていない＝失敗個体の疑い）
 */
export function cutoutBackground(dataUrl, opts = {}) {
  const tolerance = Number.isFinite(opts.tolerance) ? opts.tolerance : 48;
  return new Promise((resolve) => {
    const fail = () => resolve({ url: dataUrl, removedRatio: 0 });
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const w = img.naturalWidth, h = img.naturalHeight;
          if (!w || !h) return fail();
          const cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          const ctx = cv.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, 0, 0);
          const id = ctx.getImageData(0, 0, w, h);
          const d = id.data;

          // 外周ピクセルを収集し、各チャンネルの中央値を背景色とする（隅ノイズに強い）
          const rs = [], gs = [], bs = [], border = [];
          const pushEdge = (x, y) => {
            const p = (y * w + x) * 4;
            rs.push(d[p]); gs.push(d[p + 1]); bs.push(d[p + 2]);
            border.push(y * w + x);
          };
          for (let x = 0; x < w; x++) { pushEdge(x, 0); pushEdge(x, h - 1); }
          for (let y = 0; y < h; y++) { pushEdge(0, y); pushEdge(w - 1, y); }
          const br = median(rs), bg = median(gs), bb = median(bs);

          const tol2 = tolerance * tolerance;
          const nearBg = (p4) => {
            const dr = d[p4] - br, dg = d[p4 + 1] - bg, db = d[p4 + 2] - bb;
            return (dr * dr + dg * dg + db * db) <= tol2;
          };

          // 外周のうち背景色に近い画素だけをシードにフラッドフィル
          const visited = new Uint8Array(w * h);
          const stack = [];
          for (const idx of border) { if (nearBg(idx * 4)) stack.push(idx); }
          let removed = 0;
          while (stack.length) {
            const idx = stack.pop();
            if (visited[idx]) continue;
            visited[idx] = 1;
            const p4 = idx * 4;
            if (!nearBg(p4)) continue;
            d[p4 + 3] = 0; // 透過
            removed++;
            const x = idx % w, y = (idx / w) | 0;
            if (x > 0) stack.push(idx - 1);
            if (x < w - 1) stack.push(idx + 1);
            if (y > 0) stack.push(idx - w);
            if (y < h - 1) stack.push(idx + w);
          }

          ctx.putImageData(id, 0, 0);
          resolve({ url: cv.toDataURL('image/png'), removedRatio: removed / (w * h) });
        } catch (_) { fail(); }
      };
      img.onerror = fail;
      img.src = dataUrl;
    } catch (_) { fail(); }
  });
}
