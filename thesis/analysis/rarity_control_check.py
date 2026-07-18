#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
rarity_control_check.py — E-A の見かけの効果が「レア度構成の差」で説明できるかを検証する。

背景: E-A（介入後 post vs 介入前 pre）の平均輪郭複雑度は +0.46 の差があった。
だが2条件はレア度構成が揃っておらず、レア度自体が輪郭を強く決めている。
本スクリプトは同一レア度どうしで比較し直し、残差効果を出す。

使い方: python3 rarity_control_check.py <post/results.json> <pre/results.json>
"""
import json, sys
import numpy as np
from collections import defaultdict

def load(p):
    return [r for r in json.load(open(p)) if r.get("metrics")]

def by_rarity(rows, key="contour"):
    o = defaultdict(list)
    for r in rows:
        o[r["rarity"]].append(r["metrics"][key])
    return o

def main(post_path, pre_path, key="contour"):
    post, pre = load(post_path), load(pre_path)
    P, Q = by_rarity(post, key), by_rarity(pre, key)
    ap = [r["metrics"][key] for r in post]
    aq = [r["metrics"][key] for r in pre]

    print("=== 元の比較（レア度ごちゃまぜ）===")
    print(f"  post: n={len(ap)} mean={np.mean(ap):.2f} sd={np.std(ap):.2f}")
    print(f"  pre : n={len(aq)} mean={np.mean(aq):.2f} sd={np.std(aq):.2f}")
    print(f"  -> 差 {np.mean(ap)-np.mean(aq):+.2f} / σ差 {np.std(ap)-np.std(aq):+.2f}")

    print("\n=== レア度をそろえて比較 ===")
    diffs = []
    for rar in ["common", "rare", "epic", "legend"]:
        if rar in P and rar in Q:
            d = np.mean(P[rar]) - np.mean(Q[rar])
            diffs.append((d, len(P[rar]) + len(Q[rar])))
            print(f"  {rar:8s} post n={len(P[rar])} {np.mean(P[rar]):.2f} | "
                  f"pre n={len(Q[rar])} {np.mean(Q[rar]):.2f} | 差 {d:+.2f}")
        else:
            print(f"  {rar:8s} 比較不能 (post n={len(P.get(rar,[]))}, pre n={len(Q.get(rar,[]))})")
    if diffs:
        w = sum(d*n for d, n in diffs) / sum(n for _, n in diffs)
        print(f"\n  同一レア度どうしの重み付き平均差 = {w:+.2f}")

    print("\n=== レア度そのものの効果（両条件をプール）===")
    allr = defaultdict(list)
    for r in post + pre:
        allr[r["rarity"]].append(r["metrics"][key])
    for rar in ["common", "rare", "epic", "legend"]:
        if rar in allr:
            print(f"  {rar:8s} n={len(allr[rar]):2d} 平均={np.mean(allr[rar]):.2f}")

if __name__ == "__main__":
    a = sys.argv[1] if len(sys.argv) > 1 else "../data/runs/E-A-post/results.json"
    b = sys.argv[2] if len(sys.argv) > 2 else "../data/runs/E-A-pre/results.json"
    main(a, b)
