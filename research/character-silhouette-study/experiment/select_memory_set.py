#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
select_memory_set.py — 記憶テスト用の【固定項目セット】を層化抽出する。

設計の要点:
  - 記憶可能性は**項目の性質**なので、分析単位は参加者ではなく項目。
    → 全員に同じ項目を見せれば、参加者5名でも項目あたり5観測が貯まる。
  - 候補指標（孤立度など）の値が**widely 散る**ように層化抽出すると、
    相関の検出力が最大化される（予測変数の分散を最大化する古典的な設計）。
  - 覚える項目(old)と、見ていない項目(lure)は指標分布を揃える。
    → 揃えないと「lureの方が目立つ」等の交絡が入る。

出力: memory_set.json（study と lure のID一覧）
使い方: python3 select_memory_set.py --n-study 50 --seed 0
"""
import os, json, argparse
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
STRAT_KEY = "mahalanobis"   # 層化に使う主指標（候補の中で最も情報量が期待できるもの）


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n-study", type=int, default=50, help="覚える項目数（lureも同数）")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--bins", type=int, default=10, help="層の数")
    args = ap.parse_args()

    p = os.path.join(HERE, "results_machine", "memorability_proxies.json")
    if not os.path.exists(p):
        print("先に memorability_proxies.py を実行してください。")
        return
    rows = json.load(open(p))
    rng = np.random.default_rng(args.seed)

    vals = np.array([r[STRAT_KEY] for r in rows])

    # ★source（生成/参照）を study と lure で必ず揃える。
    #   揃えないと「見た＝生成」の交絡が入り、記憶可能性でなく出自を測ってしまう。
    study, lure = [], []
    for src in ("generated", "reference"):
        idx = [i for i in range(len(rows)) if rows[i]["source"] == src]
        # このsourceから使える最大数（study/lure同数）
        half = min(len(idx) // 2, args.n_study // 2)
        # 指標で層化: 値順に並べ、上位から交互に study / lure へ割り振る
        idx_sorted = sorted(idx, key=lambda i: vals[i])
        # 等間隔に 2*half 件サンプリングして指標範囲を広く覆う
        take = np.linspace(0, len(idx_sorted) - 1, 2 * half).round().astype(int)
        take = list(dict.fromkeys(take.tolist()))
        chosen = [idx_sorted[t] for t in take]
        for rank, i in enumerate(chosen):
            (study if rank % 2 == 0 else lure).append(rows[i]["stim_id"])
    rng.shuffle(study); rng.shuffle(lure)

    def stat(ids):
        v = np.array([r[STRAT_KEY] for r in rows if r["stim_id"] in set(ids)])
        return f"n={len(ids)} {STRAT_KEY}: 平均{v.mean():.3f} 範囲[{v.min():.3f},{v.max():.3f}]"

    src = {r["stim_id"]: r["source"] for r in rows}
    out = dict(strat_key=STRAT_KEY, seed=args.seed,
               study=study, lure=lure,
               composition=dict(
                   study={s: sum(1 for i in study if src[i] == s) for s in ("generated", "reference")},
                   lure={s: sum(1 for i in lure if src[i] == s) for s in ("generated", "reference")}))
    json.dump(out, open(os.path.join(HERE, "memory_set.json"), "w"), ensure_ascii=False, indent=1)
    print("study:", stat(study))
    print("lure :", stat(lure))
    print("内訳 study:", out["composition"]["study"], " lure:", out["composition"]["lure"])
    print(f"-> {os.path.join(HERE, 'memory_set.json')}")
    print("\n※ 全参加者にこの同一セットを提示すること（項目あたりの観測数を稼ぐため）")


if __name__ == "__main__":
    main()
