#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
serve_quiz.py — シルエットクイズをリモート（iPad等）から実施するための配信＋回収サーバ。

なぜ必要か:
  iOS Safari では Blob のダウンロードが Files アプリ経由になり、結果を Mac へ戻すのが手間。
  このサーバは「配信」と「結果の受け取り(POST)」を兼ねるので、
  **iPad を渡すだけで結果が Mac の results/ に自動保存される。**

特徴:
  - 0.0.0.0 にバインドするので [[Tailscale]] 経由で他端末から到達できる
  - POST /submit で JSON を受け取り results/quiz_<pid>_<時刻>.json に保存
  - 起動時に、開くべきURL（ローカル / Tailscale）を表示する
  - 公開範囲は experiment ディレクトリのみ（リポジトリ全体は晒さない）

使い方:
  python3 serve_quiz.py            # 既定 8080番
  python3 serve_quiz.py --port 9000
"""
import os, sys, json, argparse, subprocess, socket, re
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
RESULTS = os.path.join(HERE, "results")


def tailscale_ip():
    """Tailscale の IPv4 を取得（CLIの場所は環境差があるので複数試す）。"""
    cands = [
        "tailscale",
        "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
        "/usr/local/bin/tailscale",
        "/opt/homebrew/bin/tailscale",
    ]
    for c in cands:
        try:
            out = subprocess.run([c, "ip", "-4"], capture_output=True, text=True, timeout=5)
            ip = out.stdout.strip().splitlines()[0].strip() if out.stdout.strip() else ""
            if re.match(r"^100\.\d+\.\d+\.\d+$", ip):
                return ip
        except Exception:
            continue
    return None


def lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return None


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=HERE, **kw)

    def log_message(self, fmt, *args):
        # 静かにする（POSTだけ通知）
        pass

    def do_POST(self):
        if self.path.rstrip("/") != "/submit":
            self.send_error(404)
            return
        try:
            n = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(n)
            data = json.loads(body.decode("utf-8"))
        except Exception as e:
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": False, "error": str(e)}).encode())
            return

        os.makedirs(RESULTS, exist_ok=True)
        pid = re.sub(r"[^A-Za-z0-9_-]", "", str(data.get("participant", {}).get("pid", "anon")))[:32] or "anon"
        ts = datetime.now().strftime("%Y-%m-%d-%H-%M-%S")
        path = os.path.join(RESULTS, f"quiz_{pid}_{ts}.json")
        with open(path, "w") as f:
            json.dump(data, f, ensure_ascii=False, indent=1)

        mem = data.get("memory", [])
        trip = data.get("triplet", [])
        print(f"  ✅ 受信: {os.path.basename(path)}  （記憶 {len(mem)}試行 / 3択 {len(trip)}試行）", flush=True)

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps({"ok": True, "saved": os.path.basename(path)}).encode())

    def end_headers(self):
        # iPadでのキャッシュ事故を避ける
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8080)
    args = ap.parse_args()

    # 前提ファイルの確認
    missing = []
    if not os.path.exists(os.path.join(HERE, "stimuli", "manifest.json")):
        missing.append("stimuli/manifest.json（→ python3 make_stimuli.py）")
    if not os.path.exists(os.path.join(HERE, "memory_set.json")):
        missing.append("memory_set.json（→ python3 select_memory_set.py）")
    if missing:
        print("⚠ 先に用意が必要:")
        for m in missing:
            print("   -", m)
        print()

    os.makedirs(RESULTS, exist_ok=True)
    srv = ThreadingHTTPServer(("0.0.0.0", args.port), Handler)

    print("=" * 62)
    print("  シルエットクイズ 配信サーバ")
    print("=" * 62)
    print(f"  結果の保存先: {RESULTS}")
    print()
    print("  この端末（Mac）から:")
    print(f"    http://localhost:{args.port}/silhouette-quiz.html")
    ts_ip = tailscale_ip()
    if ts_ip:
        print()
        print("  ★ iPad など Tailscale の他端末から:")
        print(f"    http://{ts_ip}:{args.port}/silhouette-quiz.html")
    else:
        print()
        print("  Tailscale IP を自動取得できませんでした。")
        print("  Tailscale アプリで自分のIP（100.x.x.x）を確認し、次の形式で開いてください:")
        print(f"    http://<100.x.x.x>:{args.port}/silhouette-quiz.html")
    ln = lan_ip()
    if ln:
        print()
        print(f"  （同一LANなら: http://{ln}:{args.port}/silhouette-quiz.html ）")
    print()
    print("  ※ 結果は自動でこのMacに送信されます（iPadでのダウンロード操作は不要）")
    print("  ※ 停止は Ctrl+C")
    print("=" * 62)
    print()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n停止しました。")


if __name__ == "__main__":
    main()
