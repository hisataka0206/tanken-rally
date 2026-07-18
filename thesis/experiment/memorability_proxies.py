#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
memorability_proxies.py — 「記憶可能性」の候補代理指標を作って比較する。

背景:
  現行の形状スカラー指標（輪郭・ソリディティ・対称性）は、予備の記憶テストで
  個体ヒット率とほぼ無相関だった（ρ≈0, n=12）。よって別の指標が要る。

理論的な当たり:
  記憶研究で最も頑健な知見のひとつが **孤立効果 / von Restorff effect**:
  「集団の中で異質なものほど記憶に残る」。
  つまり記憶可能性は**個体の属性**ではなく**集団に対する相対的な位置**で決まる可能性が高い。
  これは杉森建の原則7（あえて崩して記憶に残す）とも整合する。

候補指標（すべて埋め込み空間で計算・人手ラベル不要）:
  1. centroid_dist   : 集団の重心からの距離（典型性の逆）
  2. knn_isolation   : k近傍までの平均距離（局所的な孤立度）
  3. nn1_dist        : 最近傍までの距離（一番似た相手との距離＝混同されにくさ）
  4. mahalanobis     : 共分散を考慮した異常度
  5. local_density   : 近傍密度（小さいほど孤立）※ knn の逆数
  6. shape_extremity : 形状スカラー指標のzスコア絶対値の最大（極端さ）

使い方:
  python3 memorability_proxies.py            # 指標を計算して保存
  python3 memorability_proxies.py --validate 'results/*.json'   # 記憶データと突き合わせ
"""
import os, sys, json, glob, argparse
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from run_machine_quiz import load_cache, cache_path  # noqa: E402


def load_embeddings():
    """【母集団】参照ロスター1025体のシルエット埋め込み。"""
    return load_cache(cache_path("reference", "sil"))


def embed_quiz_stimuli():
    """【評価対象】クイズで実際に使った刺激そのものを埋め込む（IDを一致させるため）。
    命名が機械ベンチマーク側（ZIP由来）と異なるので、ここで別途計算してキャッシュする。"""
    import glob as _g
    from machine_quiz import load_model, embed
    cp = cache_path("quizstim", "sil")
    cache = load_cache(cp)
    paths = sorted(_g.glob(os.path.join(HERE, "stimuli", "generated", "*.png"))) + \
            sorted(_g.glob(os.path.join(HERE, "stimuli", "reference", "*.png")))
    todo = [p for p in paths if os.path.basename(p) not in cache]
    if todo:
        model, tf, torch = load_model(224)
        E = embed(todo, model, tf, torch, flatten=False)
        for p, v in zip(todo, E):
            cache[os.path.basename(p)] = v
        import numpy as _np
        _np.savez(cp, keys=_np.array(list(cache.keys()), dtype=object),
                  vecs=_np.stack(list(cache.values())))
    return cache


def proxies(E, keys, ref_pop=None):
    """E: (n,d) 正規化済み埋め込み。ref_pop: 比較対象の母集団（None なら自分自身）。"""
    P = E if ref_pop is None else ref_pop
    mu = P.mean(0)
    mu /= (np.linalg.norm(mu) + 1e-9)
    centroid_dist = 1 - E @ mu

    S = E @ P.T                      # コサイン類似度
    D = 1 - S                        # 距離
    # ★自己一致の除外（重要）:
    #   評価対象が母集団に含まれる場合（参照刺激は1025体の中にいる）、最近傍が自分自身になり
    #   距離0が入る。これを放置すると nn1_dist が「生成か参照か」を表すだけの指標に化ける。
    #   距離がほぼ0の相手は同一個体とみなして除外する。
    D = np.where(D < 1e-3, np.inf, D)
    Dsort = np.sort(D, axis=1)
    nn1 = Dsort[:, 0]
    k = min(10, Dsort.shape[1])
    knn_iso = Dsort[:, :k].mean(1)

    # マハラノビス（次元が大きいので主成分で縮約してから）
    X = P - P.mean(0)
    U, s, Vt = np.linalg.svd(X, full_matrices=False)
    d = min(32, (s > 1e-6).sum())
    W = Vt[:d].T
    Z = (E - P.mean(0)) @ W
    Zp = X @ W
    cov = np.cov(Zp.T) + np.eye(d) * 1e-4
    inv = np.linalg.inv(cov)
    maha = np.sqrt(np.einsum('ij,jk,ik->i', Z, inv, Z))

    return dict(centroid_dist=centroid_dist, knn_isolation=knn_iso,
                nn1_dist=nn1, mahalanobis=maha, local_density=-knn_iso)


def spearman(a, b):
    ra = np.argsort(np.argsort(a)); rb = np.argsort(np.argsort(b))
    return float(np.corrcoef(ra, rb)[0, 1])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--validate", default=None, help="記憶テスト結果のglob")
    args = ap.parse_args()

    pop = load_embeddings()
    if not pop:
        print("埋め込みキャッシュがありません。先に run_machine_quiz.py を実行してください。")
        return
    Eref = np.stack(list(pop.values()))          # 母集団 = 参照ロスター1025体

    stim = embed_quiz_stimuli()                  # 評価対象 = クイズ刺激そのもの
    allk = sorted(stim.keys())
    Eall = np.stack([stim[k] for k in allk])
    P = proxies(Eall, allk, ref_pop=Eref)
    # 形状スカラーも足す
    man = json.load(open(os.path.join(HERE, "stimuli", "manifest.json")))
    met = {}
    for x in man["generated"] + man["reference"]:
        if x.get("metrics"):
            met[x["id"]] = x["metrics"]

    rows = []
    for i, sid in enumerate(allk):
        src = "reference" if sid.startswith("ref_") else "generated"
        rows.append(dict(source=src, stim_id=sid,
                         **{m: float(P[m][i]) for m in P}))
    json.dump(rows, open(os.path.join(HERE, "results_machine", "memorability_proxies.json"), "w"),
              ensure_ascii=False, indent=1)
    print(f"指標を計算: {len(rows)} 個体 -> results_machine/memorability_proxies.json\n")

    # 参照 vs 生成 の孤立度分布（生成は"典型的"に寄っていないか）
    print("=== 参照母集団に対する孤立度（生成キャラは埋もれていないか）===")
    for m in ("centroid_dist", "knn_isolation", "nn1_dist", "mahalanobis"):
        r = np.array([x[m] for x in rows if x["source"] == "reference"])
        g = np.array([x[m] for x in rows if x["source"] == "generated"])
        print(f"  {m:15s} 参照 {r.mean():.4f}  生成 {g.mean():.4f}  差 {g.mean()-r.mean():+.4f}")

    if not args.validate:
        print("\n（記憶データと突き合わせるには --validate 'results/*.json'）")
        return

    # ---- 記憶テストとの突き合わせ ----
    files = []
    for p in args.validate.split():
        files.extend(glob.glob(p))
    R = [json.load(open(f)) for f in files]
    per = {}
    for r in R:
        for m in r.get("memory", []):
            if m["wasOld"]:
                per.setdefault(m["id"], []).append(1 if m["saidOld"] else 0)
    hit = {k: float(np.mean(v)) for k, v in per.items() if v}
    print(f"\n=== 記憶データとの相関（個体 {len(hit)} 件・観測 {sum(len(v) for v in per.values())}）===")
    byid = {x["stim_id"]: x for x in rows}
    names = ["centroid_dist", "knn_isolation", "nn1_dist", "mahalanobis"]
    ids = [k for k in hit if k in byid]
    if len(ids) < 8:
        print(f"  突き合わせ可能な個体が {len(ids)} 件しかありません。記憶試行を増やしてください。")
        return
    y = np.array([hit[k] for k in ids])
    for m in names:
        x = np.array([byid[k][m] for k in ids])
        print(f"  {m:15s} ρ = {spearman(x, y):+.3f}  (n={len(ids)})")
    for m in ("contour", "solidity", "symmetry"):
        xs = [(met[k][m], hit[k]) for k in ids if k in met and m in met[k]]
        if len(xs) >= 8:
            x = np.array([a for a, _ in xs]); yy = np.array([b for _, b in xs])
            print(f"  {m:15s} ρ = {spearman(x, yy):+.3f}  (n={len(xs)})  ※現行指標")


if __name__ == "__main__":
    main()
