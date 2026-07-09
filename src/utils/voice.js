// 音声入力ユーティリティ（ブラウザ側）
//
// 2方式をサポートする：
//   1. Web Speech API（webkitSpeechRecognition）… 端末内で認識。無料・すぐ・追加コストなし。
//      ただし iOS Safari では不安定／未対応のことがある。
//   2. 録音 → OpenAI Whisper（ai.js の transcribeAudio に Blob を渡す）… 高精度・iOSでも安定。
//      録音自体はこのファイルの AudioRecorder が担当する。
//
// [[音声入力]] [[Web Speech API]] [[Whisper]]
import { LANG } from './i18n.js?v=106';

// Web Speech API 用の言語コード（BCP-47）
export function speechLang() {
  return LANG === 'en' ? 'en-US' : 'ja-JP';
}

// この端末で Web Speech API（音声認識）が使えるか
export function supportsWebSpeech() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

// この端末で録音（Whisper 用の音声取得）が使えるか
export function supportsRecording() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
}

// Web Speech API を開始する。返り値は「停止する関数」。
//   onInterim(text) … 認識途中の暫定テキスト（interim=true のとき）
//   onFinal(finalText) … これまでに確定したテキスト全体
//   onError(err) … エラー
//   onEnd(finalText) … 認識終了（確定テキストを渡す）
export function startWebSpeech({ lang, interim = true, onInterim, onFinal, onError, onEnd } = {}) {
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Ctor) {
    if (onError) onError(new Error('web-speech-unsupported'));
    return () => {};
  }
  const rec = new Ctor();
  rec.lang = lang || speechLang();
  rec.interimResults = !!interim;
  rec.continuous = true;
  rec.maxAlternatives = 1;

  let finalText = '';
  let stopped = false;

  rec.onresult = (ev) => {
    let interimText = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interimText += r[0].transcript;
    }
    if (interimText && onInterim) onInterim(interimText);
    if (onFinal) onFinal(finalText);
  };
  rec.onerror = (ev) => { if (onError) onError(ev.error || ev); };
  rec.onend = () => { if (onEnd) onEnd(finalText); };

  try {
    rec.start();
  } catch (e) {
    if (onError) onError(e);
  }

  return () => {
    if (stopped) return;
    stopped = true;
    try { rec.stop(); } catch (e) { /* no-op */ }
  };
}

// 録音して音声 Blob を得る（Whisper 送信用）。
//   const recorder = new AudioRecorder();
//   await recorder.start();
//   const blob = await recorder.stop();   // 停止 → Blob を返す
export class AudioRecorder {
  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.chunks = [];
    const mime = MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '');
    this.rec = mime
      ? new MediaRecorder(this.stream, { mimeType: mime })
      : new MediaRecorder(this.stream);
    this.rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    this.rec.start();
  }

  stop() {
    return new Promise((resolve) => {
      if (!this.rec) { this._cleanup(); return resolve(null); }
      this.rec.onstop = () => {
        const type = this.rec.mimeType || 'audio/webm';
        const blob = new Blob(this.chunks, { type });
        this._cleanup();
        resolve(blob);
      };
      try {
        this.rec.stop();
      } catch (e) {
        this._cleanup();
        resolve(null);
      }
    });
  }

  _cleanup() {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
    }
    this.stream = null;
    this.rec = null;
  }
}
