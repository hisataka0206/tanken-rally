#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
machine_quiz.py — シルエット識別性の【自動】ベンチマーク（人間の参加者を必要としない）

課題: 「このシルエットは、どのキャラか？」
  シルエット画像を手がかりに、カラー画像のギャラリーから正解を検索する。
  ＝ シルエットクイズを機械に解かせる。正解率が高い＝形だけで識別できている。

なぜこれで良いか:
  - C4（シルエットクイズ）の本質は「形だけで個体を同定できるか」であり、
    その測定に人間が必須なわけではない。機械に同じ課題を解かせれば、
    **人ゼロ・試行数無制限**で同じ構成概念を測れる。
  - 参照ロスター(1025)と生成キャラを同一条件で比較でき、(a)の残差が定量化できる。

限界（正直に）:
  - 機械の"見え方"は人間と同一ではない。よって本指標は代理である。
  - ただし従来の形状スカラー指標（輪郭等）より**課題そのものに近い**代理であり、
    少人数(≤5名)の人間データで較正すれば、機械側を大規模に回せる。

出力:
  - top-1 / top-5 / MRR（全ギャラリー検索）
  - k-AFC 正解率（k択。人間の4択課題と直接比較できる）
  - 個体ごとの順位（＝どのキャラが埋もれているかの診断）

使い方:
  python3 machine_quiz.py --name reference --color ../../pokemon_all --sil stimuli/reference
  python3 machine_quiz.py --name generated --color work/gen_color --sil work/gen_sil
"""
import os, sys, json, glob, argparse
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))


def load_model(size=224):
    """size を下げると大幅に高速化する（DINOv2既定の518はCPUだと重い）。
    ViT-S/14 はパッチ14なので size は14の倍数にする。"""
    import torch, timm
    size = int(round(size / 14) * 14)
    m = timm.create_model('vit_small_patch14_dinov2.lvd142m', pretrained=True,
                          num_classes=0, img_size=size).eval()
    cfg = timm.data.resolve_data_config({}, model=m)
    cfg["input_size"] = (3, size, size)
    cfg["crop_pct"] = 1.0
    tf = timm.data.create_transform(**cfg, is_training=False)
    return m, tf, torch


def flatten_on_white(path):
    """透過画像を白背景に合成して返す（シルエットと同じ土俵に乗せる）。"""
    im = Image.open(path).convert("RGBA")
    bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
    bg.alpha_composite(im)
    return bg.convert("RGB")


def embed(paths, model, tf, torch, flatten=False, batch=32):
    vs = []
    for i in range(0, len(paths), batch):
        chunk = paths[i:i+batch]
        ims = [tf(flatten_on_white(p) if flatten else Image.open(p).convert("RGB")) for p in chunk]
        with torch.no_grad():
            f = model(torch.stack(ims))
        vs.append(torch.nn.functional.normalize(f, dim=-1).numpy())
    return np.concatenate(vs) if vs else np.zeros((0, 384))


def key_of(path):
    """対応付けキー。'ref_1011.png' -> '1011' / '1011.png' -> '1011' / 'gen_X_00.png' -> 'gen_X_00'"""
    b = os.path.splitext(os.path.basename(path))[0]
    return b[4:] if b.startswith("ref_") else b


def kafc(sim, k, trials=2000, seed=0):
    """k択課題の正解率。正解1つ＋ランダム妨害k-1個から選ばせる（人間の4択と同型）。"""
    rng = np.random.default_rng(seed)
    n = sim.shape[0]
    if n <= k:
        return float("nan")
    hit = 0
    for _ in range(trials):
        i = rng.integers(n)
        others = rng.choice([j for j in range(n) if j != i], size=k-1, replace=False)
        cand = np.concatenate([[i], others])
        hit += int(cand[np.argmax(sim[i, cand])] == i)
    return hit / trials


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", required=True)
    ap.add_argument("--color", required=True, help="カラー画像のディレクトリ")
    ap.add_argument("--sil", required=True, help="シルエット画像のディレクトリ")
    ap.add_argument("--out", default=None)
    ap.add_argument("--size", type=int, default=224)
    args = ap.parse_args()

    cols = {key_of(p): p for p in glob.glob(os.path.join(args.color, "*.png"))}
    sils = {key_of(p): p for p in glob.glob(os.path.join(args.sil, "*.png"))}
    keys = sorted(set(cols) & set(sils), key=lambda s: (len(s), s))
    if not keys:
        print(f"対応する画像が見つかりません color={len(cols)} sil={len(sils)}")
        sys.exit(1)
    print(f"[{args.name}] 対応個体数 = {len(keys)}")

    model, tf, torch = load_model(args.size)
    print("  埋め込み計算中…")
    Es = embed([sils[k] for k in keys], model, tf, torch, flatten=False)   # シルエット（クエリ）
    Ec = embed([cols[k] for k in keys], model, tf, torch, flatten=True)    # カラー（ギャラリー）

    sim = Es @ Ec.T                      # コサイン類似度（正規化済み）
    order = np.argsort(-sim, axis=1)
    ranks = np.array([int(np.where(order[i] == i)[0][0]) + 1 for i in range(len(keys))])

    res = dict(
        name=args.name, n=len(keys),
        top1=float((ranks == 1).mean()),
        top5=float((ranks <= 5).mean()),
        mrr=float((1.0 / ranks).mean()),
        median_rank=float(np.median(ranks)),
        chance_top1=1.0 / len(keys),
        afc={str(k): kafc(sim, k) for k in (2, 4, 8)},
        per_item={keys[i]: int(ranks[i]) for i in range(len(keys))},
    )
    print(f"  top-1 = {res['top1']:.3f}  (偶然 {res['chance_top1']:.4f})")
    print(f"  top-5 = {res['top5']:.3f}   MRR = {res['mrr']:.3f}   順位中央値 = {res['median_rank']:.0f}")
    for k, v in res["afc"].items():
        print(f"  {k}択の正解率 = {v:.3f}  (偶然 {1/int(k):.3f})")
    worst = sorted(res["per_item"].items(), key=lambda t: -t[1])[:5]
    print("  最も埋もれた個体（順位）:", ", ".join(f"{a}:{b}" for a, b in worst))

    out = args.out or os.path.join(HERE, "results_machine", f"{args.name}.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    json.dump(res, open(out, "w"), ensure_ascii=False, indent=1)
    print(f"  -> {out}")


if __name__ == "__main__":
    main()
