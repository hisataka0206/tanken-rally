#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
analyze_quiz.py — シルエットクイズの結果を分析する。

入力: silhouette-quiz.html が出力した quiz_*.json（複数可）＋ stimuli/manifest.json
出力: 2つの中核的な問いへの回答

  Q1【代理指標の妥当性】3択課題で人間が選んだ「いちばん形が違う」は、
     計算上の距離（形状指標）の予測と一致するか？
     → 一致しないなら、これまでの指標による結論はすべて疑わしい。
     → 一致するなら、以後は指標で代用してよい（＝棄却サンプリング等を安心して最適化できる）。

  Q2【記憶可能性】生成キャラと参照ロスターで、記憶への残りやすさに差があるか？
     個体ごとのヒット率は、形状指標で説明できるか？

使い方: python3 analyze_quiz.py results/*.json
"""
import sys, json, glob, os
import numpy as np
from itertools import combinations

HERE = os.path.dirname(os.path.abspath(__file__))
MET = ["contour", "solidity", "symmetry"]


def load_manifest():
    m = json.load(open(os.path.join(HERE, "stimuli", "manifest.json")))
    by = {}
    for x in m["generated"] + m["reference"]:
        by[x["id"]] = x
    return by


def feat_vec(item):
    """形状指標のベクトル（無い個体は None）。"""
    mm = item.get("metrics")
    if not mm:
        return None
    v = [mm.get(k) for k in MET]
    return np.array(v, float) if all(x is not None for x in v) else None


def predict_odd(options, by):
    """3枚のうち、指標空間で「他の2枚から最も離れている」ものを返す（＝代理指標の予測）。"""
    vs = [feat_vec(by.get(o, {})) for o in options]
    if any(v is None for v in vs):
        return None
    # 標準化しないと輪郭のスケールが支配するため、簡易にz化（3点のみなので範囲正規化）
    A = np.stack(vs)
    rng = A.max(0) - A.min(0)
    rng[rng == 0] = 1
    An = (A - A.min(0)) / rng
    d = [sum(np.linalg.norm(An[i] - An[j]) for j in range(3) if j != i) for i in range(3)]
    return options[int(np.argmax(d))]


def binom_p(k, n, p=1/3):
    """二項検定（片側・上側）。scipy無しでも動くよう自前実装。"""
    from math import comb
    return sum(comb(n, i) * p**i * (1-p)**(n-i) for i in range(k, n+1))


def main(paths):
    by = load_manifest()
    files = []
    for p in paths:
        files.extend(glob.glob(p))
    if not files:
        print("結果ファイルが見つかりません。例: python3 analyze_quiz.py 'results/*.json'")
        return
    R = [json.load(open(f)) for f in files]
    print(f"参加者 {len(R)} 名 / ファイル {len(files)} 件\n")

    # ---------- Q1: 代理指標の妥当性 ----------
    print("=" * 62)
    print("【Q1】3択課題: 人間の判断と計算上の距離は一致するか")
    print("=" * 62)
    tot = hit = 0
    by_src = {}
    for r in R:
        for t in r.get("triplet", []):
            pred = predict_odd(t["options"], by)
            if pred is None:
                continue
            ok = (pred == t["chosen"])
            tot += 1; hit += ok
            s = t.get("source", "?")
            by_src.setdefault(s, [0, 0])
            by_src[s][0] += ok; by_src[s][1] += 1
    if tot:
        acc = hit / tot
        p = binom_p(hit, tot)
        print(f"  一致率 = {acc:.3f}  ({hit}/{tot})   偶然=0.333")
        print(f"  二項検定（偶然より高いか） p = {p:.4g}  {'✅ 有意' if p < .05 else '❌ 有意でない'}")
        for s, (h, n) in by_src.items():
            print(f"    {s:11s}: {h/n:.3f} ({h}/{n})")
        print()
        if p < .05:
            print("  → 形状指標は人間の知覚をある程度予測する。指標での代用に一定の根拠あり。")
        else:
            print("  → ★形状指標は人間の知覚を予測できていない。")
            print("     指標のみで導いた結論（S4等）は再解釈が必要。棄却サンプリングの")
            print("     最適化対象としても不適切なので、先に指標の作り直しが要る。")
    else:
        print("  3択データがありません。")

    # ---------- Q2: 記憶可能性 ----------
    print("\n" + "=" * 62)
    print("【Q2】記憶テスト: 生成キャラ vs 参照ロスター")
    print("=" * 62)
    rows = [m for r in R for m in r.get("memory", [])]
    if not rows:
        print("  記憶データがありません。")
        return
    for src in ["generated", "reference"]:
        rs = [x for x in rows if x["source"] == src]
        if not rs:
            continue
        old = [x for x in rs if x["wasOld"]]
        new = [x for x in rs if not x["wasOld"]]
        hr = np.mean([x["saidOld"] for x in old]) if old else float("nan")
        fa = np.mean([x["saidOld"] for x in new]) if new else float("nan")
        acc = np.mean([x["correct"] for x in rs])
        rt = np.median([x["rtMs"] for x in rs])
        print(f"  {src:11s} n={len(rs):4d}  正答率={acc:.3f}  ヒット率={hr:.3f}  誤警報率={fa:.3f}  中央RT={rt:.0f}ms")

    g = [x["correct"] for x in rows if x["source"] == "generated"]
    f = [x["correct"] for x in rows if x["source"] == "reference"]
    if g and f:
        # 2標本の割合差を並べ替え検定で
        obs = np.mean(g) - np.mean(f)
        pool = np.array(g + f, float); n1 = len(g)
        rng = np.random.default_rng(0); cnt = 0; N = 20000
        for _ in range(N):
            rng.shuffle(pool)
            if abs(pool[:n1].mean() - pool[n1:].mean()) >= abs(obs):
                cnt += 1
        print(f"\n  差 = {obs:+.3f}（生成 − 参照）  並べ替え検定 p = {(cnt+1)/(N+1):.4f}")

    # 個体ごとのヒット率 × 形状指標
    per = {}
    for x in rows:
        if x["wasOld"]:
            per.setdefault(x["id"], []).append(x["saidOld"])
    pairs = []
    for pid, hits in per.items():
        v = feat_vec(by.get(pid, {}))
        if v is not None and len(hits) >= 1:
            pairs.append((np.mean(hits), v))
    if len(pairs) >= 8:
        y = np.array([p[0] for p in pairs])
        X = np.stack([p[1] for p in pairs])
        print("\n  個体ヒット率 と 形状指標 の相関（Spearman）:")
        for i, k in enumerate(MET):
            xr = X[:, i]
            rx = np.argsort(np.argsort(xr)); ry = np.argsort(np.argsort(y))
            rho = np.corrcoef(rx, ry)[0, 1]
            print(f"    {k:10s} ρ = {rho:+.3f}   (n={len(y)})")
        print("  → 正の相関があれば「形が複雑なほど記憶に残る」。")
        print("     杉森原則7（記憶可能性）を指標で近似できるかの手がかりになる。")
    else:
        print("\n  個体別相関には試行が足りません（参加者を増やしてください）。")


if __name__ == "__main__":
    main(sys.argv[1:] or [os.path.join(HERE, "results", "*.json")])
