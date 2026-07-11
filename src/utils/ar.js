// ARキャラクター捕獲：カメラ・GPS・コンパスの統合セッション
//
// 出現条件（docs/ar-character-capture-spec.md §2）:
//   - 距離: スポットから radiusM（既定50m）以内
//   - 向き: 端末コンパス方位が「現在地→スポット」方位角の ±toleranceDeg（既定30°）以内
//   - ヒステリシス: 一度出現したら ±(toleranceDeg+10)° まで表示継続（チカチカ防止）
//
// フォールバック:
//   - コンパス取得不可 → 距離のみで判定（status.headingAvailable=false）
//   - GPS取得不可     → forceAppear()（「キャラをよぶ」ボタン）で手動出現
//   - どちらも UI 側（main.js）が status を見て案内を出す

/** この端末でARカメラが使えるか（HTTPS + getUserMedia） */
export function supportsArCamera() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

/** iOS Safari のコンパス許可をリクエストする。
 *  必ずユーザー操作（クリック）ハンドラ内から呼ぶこと。
 *  返り値: 'granted' | 'denied' | 'unsupported'（許可不要な環境は 'granted'） */
export async function requestOrientationPermission() {
  try {
    if (typeof DeviceOrientationEvent !== 'undefined'
        && typeof DeviceOrientationEvent.requestPermission === 'function') {
      const res = await DeviceOrientationEvent.requestPermission();
      return res === 'granted' ? 'granted' : 'denied';
    }
  } catch (e) {
    console.warn('[ar] orientation permission error:', e);
    return 'denied';
  }
  if (typeof DeviceOrientationEvent === 'undefined') return 'unsupported';
  return 'granted'; // Android 等は許可ダイアログ不要
}

export class ArSession {
  /**
   * @param {Object} opts
   * @param {{lat:number,lng:number}|null} opts.target  スポット座標（nullなら距離・向き判定なし）
   * @param {number} [opts.radiusM=50]
   * @param {number} [opts.toleranceDeg=30]
   * @param {number} [opts.hysteresisDeg=10]
   * @param {(status:Object)=>void} [opts.onUpdate]  判定状態が変わるたび呼ばれる
   */
  constructor({ target = null, radiusM = 50, toleranceDeg = 30, hysteresisDeg = 10, onUpdate = null } = {}) {
    this.target = target;
    this.radiusM = radiusM;
    this.toleranceDeg = toleranceDeg;
    this.hysteresisDeg = hysteresisDeg;
    this.onUpdate = onUpdate;

    this.stream = null;
    this._geoWatchId = null;
    this._orientationHandler = null;
    this._orientationEventName = null;
    this._forced = false;

    this.status = {
      gpsAvailable: false,
      headingAvailable: false,
      position: null,        // { lat, lng, accuracy }
      distanceM: null,
      withinRadius: false,
      bearingDeg: null,      // 現在地→スポット
      headingDeg: null,      // 端末コンパス方位
      angleDiffDeg: null,
      aligned: false,
      visible: false,        // キャラ表示中か（ヒステリシス込み）
      forced: false,
    };
  }

  /** カメラを起動し video 要素に流す。GPS/コンパス監視も開始。 */
  async start(videoEl) {
    if (!supportsArCamera()) throw new Error('camera unsupported');
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
    videoEl.srcObject = this.stream;
    try { await videoEl.play(); } catch (_) { /* play() は autoplay 属性があれば失敗しても流れる */ }
    this._watchPosition();
    this._watchOrientation();
    this._emit();
  }

  /** すべて停止・解放する。 */
  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    if (this._geoWatchId != null) {
      navigator.geolocation.clearWatch(this._geoWatchId);
      this._geoWatchId = null;
    }
    if (this._orientationHandler && this._orientationEventName) {
      window.removeEventListener(this._orientationEventName, this._orientationHandler, true);
      this._orientationHandler = null;
    }
  }

  /** 手動出現（GPS/コンパス不可時のフォールバック）。 */
  forceAppear() {
    this._forced = true;
    this._recompute();
  }

  /** video の現在フレームに overlay 描画を合成した JPEG File を返す。
   *  @param {HTMLVideoElement} videoEl
   *  @param {(ctx:CanvasRenderingContext2D, w:number, h:number)=>void|null} drawOverlay */
  async captureComposite(videoEl, drawOverlay) {
    const w = videoEl.videoWidth || 1280;
    const h = videoEl.videoHeight || 720;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoEl, 0, 0, w, h);
    if (drawOverlay) drawOverlay(ctx, w, h);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.92);
    });
    return new File([blob], `ar_capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
  }

  // ===== 内部処理 =====

  _watchPosition() {
    if (!navigator.geolocation) return;
    this._geoWatchId = navigator.geolocation.watchPosition(
      pos => {
        this.status.gpsAvailable = true;
        this.status.position = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        this._recompute();
      },
      err => {
        console.warn('[ar] geolocation error:', err);
        this.status.gpsAvailable = false;
        this._recompute();
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    );
  }

  _watchOrientation() {
    // Android Chrome: deviceorientationabsolute（alpha が真北基準）
    // iOS Safari:     deviceorientation の webkitCompassHeading
    // ※ 画面回転の補正は P1 では未対応（縦持ち前提）。実機検証で必要なら追加する。
    const handler = e => {
      let heading = null;
      if (typeof e.webkitCompassHeading === 'number' && !isNaN(e.webkitCompassHeading)) {
        heading = e.webkitCompassHeading; // iOS: 北=0、時計回り
      } else if (e.absolute === true && typeof e.alpha === 'number') {
        heading = (360 - e.alpha) % 360;  // absolute alpha: 反時計回り → 時計回りに変換
      }
      if (heading != null) {
        this.status.headingAvailable = true;
        this.status.headingDeg = heading;
        this._recompute();
      }
    };
    const evName = ('ondeviceorientationabsolute' in window)
      ? 'deviceorientationabsolute'
      : 'deviceorientation';
    this._orientationEventName = evName;
    this._orientationHandler = handler;
    window.addEventListener(evName, handler, true);
  }

  _recompute() {
    const s = this.status;
    s.forced = this._forced;

    if (this.target && s.position) {
      s.distanceM = haversineM(s.position, this.target);
      s.withinRadius = s.distanceM <= this.radiusM;
      s.bearingDeg = bearingDeg(s.position, this.target);
    } else {
      s.distanceM = null;
      s.withinRadius = false;
      s.bearingDeg = null;
    }

    if (s.headingAvailable && s.bearingDeg != null && s.headingDeg != null) {
      s.angleDiffDeg = angleDiff(s.headingDeg, s.bearingDeg);
      // ヒステリシス: 非表示中は tol 以内で点灯、表示中は tol+hys を超えるまで維持
      const limit = s.visible ? this.toleranceDeg + this.hysteresisDeg : this.toleranceDeg;
      s.aligned = s.angleDiffDeg <= limit;
    } else {
      s.angleDiffDeg = null;
      s.aligned = true; // コンパス不可 → 向き条件をスキップ（距離のみ判定）
    }

    s.visible = this._forced || (s.withinRadius && s.aligned);
    this._emit();
  }

  _emit() {
    if (this.onUpdate) this.onUpdate({ ...this.status });
  }
}

// ===== 幾何ユーティリティ =====

/** 2点間距離（メートル） */
export function haversineM(a, b) {
  const R = 6371000;
  const dLat = deg2rad(b.lat - a.lat);
  const dLng = deg2rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(deg2rad(a.lat)) * Math.cos(deg2rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** a から b への方位角（北=0、時計回り 0-360） */
export function bearingDeg(a, b) {
  const φ1 = deg2rad(a.lat), φ2 = deg2rad(b.lat);
  const Δλ = deg2rad(b.lng - a.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (rad2deg(Math.atan2(y, x)) + 360) % 360;
}

/** 2方位の差（0-180） */
export function angleDiff(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

const deg2rad = d => d * Math.PI / 180;
const rad2deg = r => r * 180 / Math.PI;
