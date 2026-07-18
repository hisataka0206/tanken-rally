#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
make_stimuli.py — シルエットクイズ用の刺激セットを作る。

生成キャラ（char-lab の結果）と参照ロスター（公式アート）から、
同一手法で正規化した黒シルエットPNGを作り、manifest.json を書き出す。

正規化: 外輪郭ベタ塗り（穴埋めなし）→ bbox切り出し → 最長辺を正規化 → 正方キャンバス中央配置。
        位置・大きさの手がかりを消し、「形」だけで判断させるため。

[[IP]]配慮: 参照ロスター由来の画像は **コミットしない**（.gitignore 済み）。
            ローカルで実験するためだけに生成する。公開するのは導出統計のみ。

使い方:
  python3 make_stimuli.py                       # 既定の構成で生成
  python3 make_stimuli.py --ref-n 40 --seed 0   # 参照サンプル数を変更
"""
import os, sys, json, glob, random, argparse
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
CANVAS = 320


def silhouette(path, canvas=CANVAS):
    """外輪郭ベタ塗りの黒シルエットを、正規化して返す（白背景RGB）。"""
    im = Image.open(path).convert("RGBA")
    a = np.asarray(im)
    al = a[:, :, 3]
    if al.max() > 0 and al.min() < 250:
        m = al > 40
    else:
        rgb = a[:, :, :3].astype(np.int32)
        c = np.stack([rgb[0, 0], rgb[0, -1], rgb[-1, 0], rgb[-1, -1]]).mean(0)
        m = np.sqrt(((rgb - c) ** 2).sum(-1)) > 32
    ys, xs = np.where(m)
    if len(xs) < 20:
        return None
    crop = m[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    ch, cw = crop.shape
    target = int(canvas * 0.82)
    r = target / max(ch, cw)
    nh, nw = max(1, int(ch * r)), max(1, int(cw * r))
    mask = Image.fromarray((crop * 255).astype(np.uint8)).resize((nw, nh), Image.LANCZOS)
    out = Image.new("L", (canvas, canvas), 255)
    out.paste(Image.new("L", (nw, nh), 17), ((canvas - nw) // 2, (canvas - nh) // 2), mask)
    return out.convert("RGB")


def build_generated(outdir):
    """char-lab の実行結果（thesis/data/runs/*/results.json + 展開済みcut画像）から生成。
    展開済みZIPが無い場合は thesis/data/silhouettes/ の既存PNGを再正規化して使う。"""
    os.makedirs(outdir, exist_ok=True)
    items = []
    src_root = os.path.join(REPO, "thesis", "data", "silhouettes")
    runs_root = os.path.join(REPO, "thesis", "data", "runs")
    # 統一測定値（canonical）も引けるようにしておく
    canon_p = os.path.join(REPO, "thesis", "data", "canonical_metrics.json")
    canon = json.load(open(canon_p)) if os.path.exists(canon_p) else {}
    for run in sorted(os.listdir(src_root)) if os.path.isdir(src_root) else []:
        rd = os.path.join(src_root, run)
        if not os.path.isdir(rd):
            continue
        # results.json から index -> メタ を引く（ファイル名の NN が results の i に対応）
        rj = os.path.join(runs_root, run, "results.json")
        byi = {}
        if os.path.exists(rj):
            for r in json.load(open(rj)):
                byi[r.get("i")] = r
        canon_byi = {c["i"]: c.get("canonical", {}) for c in canon.get(run, [])}
        for p in sorted(glob.glob(f"{rd}/*.png")):
            sil = silhouette(p)
            if sil is None:
                continue
            base = os.path.basename(p)
            try:
                i = int(os.path.splitext(base)[0])
            except ValueError:
                i = None
            r = byi.get(i, {})
            name = f"gen_{run}_{base}"
            sil.save(os.path.join(outdir, name))
            items.append(dict(id=name, source="generated", run=run, idx=i,
                              rarity=r.get("rarity"), body=r.get("bodyJa"), feat=r.get("featJa"),
                              metrics=canon_byi.get(i) or None))
    return items


def build_reference(outdir, n, seed, min_dex):
    """参照ロスターからサンプル。既知性の交絡を避けるため既定で後期世代（dex>=min_dex）から抽出。"""
    os.makedirs(outdir, exist_ok=True)
    src = os.path.join(REPO, "pokemon_all")
    files = sorted(glob.glob(f"{src}/*.png"),
                   key=lambda p: int(os.path.basename(p).split(".")[0]))
    pool = [f for f in files if int(os.path.basename(f).split(".")[0]) >= min_dex]
    if len(pool) < n:
        pool = files
    random.Random(seed).shuffle(pool)
    # 参照側にも同一手法で測った形状指標を結合する（3択の代理指標検証に必須）
    import csv as _csv
    mp = os.path.join(REPO, "thesis", "data", "roster_metrics.csv")
    rmet = {}
    if os.path.exists(mp):
        for r in _csv.DictReader(open(mp)):
            try:
                rmet[int(r["dex"])] = {k: float(r[k]) for k in ("contour", "solidity", "symmetry")}
            except (ValueError, KeyError):
                pass
    items = []
    for p in pool[:n]:
        sil = silhouette(p)
        if sil is None:
            continue
        dex = int(os.path.basename(p).split(".")[0])
        name = f"ref_{dex}.png"
        sil.save(os.path.join(outdir, name))
        items.append(dict(id=name, source="reference", dex=dex, metrics=rmet.get(dex)))
    return items


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ref-n", type=int, default=40, help="参照ロスターからのサンプル数")
    ap.add_argument("--min-dex", type=int, default=650,
                    help="この番号以降から抽出（既知性の交絡を下げる）")
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()

    stim = os.path.join(HERE, "stimuli")
    gen = build_generated(os.path.join(stim, "generated"))
    ref = build_reference(os.path.join(stim, "reference"), args.ref_n, args.seed, args.min_dex)

    manifest = dict(
        canvas=CANVAS,
        note="外輪郭ベタ塗り・位置/サイズ正規化済み。参照画像は著作物由来のためコミット禁止。",
        generated=gen, reference=ref,
    )
    json.dump(manifest, open(os.path.join(stim, "manifest.json"), "w"),
              ensure_ascii=False, indent=1)
    print(f"generated: {len(gen)}  reference: {len(ref)}")
    print(f"-> {os.path.join(stim, 'manifest.json')}")


if __name__ == "__main__":
    main()
