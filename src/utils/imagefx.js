// 画像エフェクト: 生成画像（不透明背景）の背景を透過に抜く。
// キャラ自動生成では Gemini が不透明背景の画像を返すため、
//   - シルエット表示（brightness(0)）が「黒い長方形」になる
//   - reveal / 図鑑 / AR で「箱に入った絵」に見える
// を防ぐために、四隅からのフラッドフィルで背景色に連結した領域だけを透過にする。
// フラッドフィル方式なのでキャラ内部の同色（白ハイライト等）は消えない。

/**
 * 背景がおおむね均一な画像の背景を透過PNG(dataURL)にして返す。
 * 失敗時は元の dataUrl をそのまま返す（安全側）。
 * @param {string} dataUrl 元画像（data:image/...;base64,...）
 * @param {{tolerance?:number, feather?:boolean}} opts tolerance=色距離しきい値(0-441)
 * @returns {Promise<string>}
 */
export function cutoutBackground(dataUrl, opts = {}) {
  const tolerance = Number.isFinite(opts.tolerance) ? opts.tolerance : 46;
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const w = img.naturalWidth, h = img.naturalHeight;
          if (!w || !h) return resolve(dataUrl);
          const cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          const ctx = cv.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, 0, 0);
          const id = ctx.getImageData(0, 0, w, h);
          const d = id.data;

          // 四隅の平均を背景サンプルに
          const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]];
          let br = 0, bg = 0, bb = 0;
          for (const [x, y] of corners) { const p = (y * w + x) * 4; br += d[p]; bg += d[p + 1]; bb += d[p + 2]; }
          br /= 4; bg /= 4; bb /= 4;

          const tol2 = tolerance * tolerance;
          const nearBg = (p4) => {
            const dr = d[p4] - br, dg = d[p4 + 1] - bg, db = d[p4 + 2] - bb;
            return (dr * dr + dg * dg + db * db) <= tol2;
          };

          // 四隅起点のフラッドフィル（連結成分のみ透過＝内部の同色は保持）
          const visited = new Uint8Array(w * h);
          const stack = [];
          for (const [x, y] of corners) stack.push(y * w + x);
          while (stack.length) {
            const idx = stack.pop();
            if (visited[idx]) continue;
            visited[idx] = 1;
            const p4 = idx * 4;
            if (!nearBg(p4)) continue;
            d[p4 + 3] = 0; // 透過
            const x = idx % w, y = (idx / w) | 0;
            if (x > 0) stack.push(idx - 1);
            if (x < w - 1) stack.push(idx + 1);
            if (y > 0) stack.push(idx - w);
            if (y < h - 1) stack.push(idx + w);
          }

          ctx.putImageData(id, 0, 0);
          resolve(cv.toDataURL('image/png'));
        } catch (_) { resolve(dataUrl); }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    } catch (_) { resolve(dataUrl); }
  });
}
