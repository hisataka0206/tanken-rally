#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
run_machine_quiz.py — machine_quiz を「再開可能」に実行するドライバ。

埋め込みは重いので .npz にキャッシュし、1回の実行では --budget 秒だけ進める。
何度も呼べば続きから進み、全部揃った時点で検索評価まで行って結果を書き出す。

  python3 run_machine_quiz.py --name reference --color ../../pokemon_all --sil work/ref_sil
  （完了するまで繰り返し実行するだけ）
"""
import os, sys, json, glob, time, argparse
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from machine_quiz import load_model, embed, flatten_on_white, key_of, kafc  # noqa: E402


def cache_path(name, kind):
    d = os.path.join(HERE, "work", "emb")
    os.makedirs(d, exist_ok=True)
    return os.path.join(d, f"{name}_{kind}.npz")


def load_cache(p):
    if os.path.exists(p):
        z = np.load(p, allow_pickle=True)
        return {k: v for k, v in zip(z["keys"].tolist(), z["vecs"])}
    return {}


def save_cache(p, d):
    if d:
        np.savez(p, keys=np.array(list(d.keys()), dtype=object),
                 vecs=np.stack(list(d.values())))


def advance(name, kind, paths_by_key, flatten, budget, size):
    p = cache_path(name, kind)
    cache = load_cache(p)
    todo = [k for k in paths_by_key if k not in cache]
    if not todo:
        return cache, 0
    model, tf, torch = load_model(size)
    t0 = time.time()
    done = 0
    B = 16
    for i in range(0, len(todo), B):
        if time.time() - t0 > budget:
            break
        ks = todo[i:i + B]
        E = embed([paths_by_key[k] for k in ks], model, tf, torch, flatten=flatten, batch=B)
        for k, v in zip(ks, E):
            cache[k] = v
        done += len(ks)
    save_cache(p, cache)
    return cache, len(todo) - done


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", required=True)
    ap.add_argument("--color", required=True)
    ap.add_argument("--sil", required=True)
    ap.add_argument("--size", type=int, default=224)
    ap.add_argument("--budget", type=float, default=32.0, help="1回の実行で使う秒数")
    args = ap.parse_args()

    cols = {key_of(p): p for p in glob.glob(os.path.join(args.color, "*.png"))}
    sils = {key_of(p): p for p in glob.glob(os.path.join(args.sil, "*.png"))}
    keys = sorted(set(cols) & set(sils), key=lambda s: (len(s), s))
    cols = {k: cols[k] for k in keys}
    sils = {k: sils[k] for k in keys}
    print(f"[{args.name}] 対応個体 {len(keys)}")

    Cs, restS = advance(args.name, "sil", sils, False, args.budget / 2, args.size)
    Cc, restC = advance(args.name, "col", cols, True, args.budget / 2, args.size)
    print(f"  シルエット {len(Cs)}/{len(keys)} (残 {restS})   カラー {len(Cc)}/{len(keys)} (残 {restC})")
    if restS or restC:
        print("  → 未完了。もう一度このコマンドを実行してください。")
        return

    Es = np.stack([Cs[k] for k in keys])
    Ec = np.stack([Cc[k] for k in keys])
    sim = Es @ Ec.T
    order = np.argsort(-sim, axis=1)
    ranks = np.array([int(np.where(order[i] == i)[0][0]) + 1 for i in range(len(keys))])

    res = dict(name=args.name, n=len(keys),
               top1=float((ranks == 1).mean()), top5=float((ranks <= 5).mean()),
               mrr=float((1.0 / ranks).mean()), median_rank=float(np.median(ranks)),
               chance_top1=1.0 / len(keys),
               afc={str(k): kafc(sim, k) for k in (2, 4, 8)},
               per_item={keys[i]: int(ranks[i]) for i in range(len(keys))})
    print(f"  top-1={res['top1']:.3f} top-5={res['top5']:.3f} MRR={res['mrr']:.3f} 順位中央値={res['median_rank']:.0f}")
    for k, v in res["afc"].items():
        print(f"  {k}択 正解率={v:.3f} (偶然 {1/int(k):.3f})")
    out = os.path.join(HERE, "results_machine", f"{args.name}.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    json.dump(res, open(out, "w"), ensure_ascii=False, indent=1)
    print(f"  -> {out}")


if __name__ == "__main__":
    main()
