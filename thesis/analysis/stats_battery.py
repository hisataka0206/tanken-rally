#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""公式ロスター1025体に対して、適用可能な統計検定を網羅的に実施する。"""
import csv, json, numpy as np
from collections import defaultdict, Counter
from scipy import stats

R="/sessions/funny-zen-gauss/mnt/tanken-rally"
met={int(r["dex"]): {k: float(v) for k,v in r.items() if k!="dex"}
     for r in csv.DictReader(open("roster_metrics.csv"))}
meta={}
for r in csv.DictReader(open(f"{R}/docs/character-taxonomy/roster_5axis_analysis.csv", encoding="utf-8-sig")):
    try: meta[int(r["id"])]=r
    except: pass
D=[dict(dex=d, **met[d], **{k:meta[d].get(k,"") for k in ["shape","rarity","color","type_primary"]})
   for d in sorted(met) if d in meta]
print(f"結合済み: n={len(D)}\n")

METRICS=["contour","solidity","symmetry","eff_colors","edge_density","aspect","occupancy"]
def col(rows,k): return np.array([r[k] for r in rows], float)

def holm(pvals):
    idx=np.argsort(pvals); out=np.empty(len(pvals)); mx=0
    for rank,i in enumerate(idx):
        v=min(1.0,(len(pvals)-rank)*pvals[i]); mx=max(mx,v); out[i]=mx
    return out

print("="*70); print("【1】記述統計と正規性（Shapiro-Wilk, n=1025）"); print("="*70)
for k in METRICS:
    v=col(D,k); W,p=stats.shapiro(v[:5000])
    sk,ku=stats.skew(v),stats.kurtosis(v)
    print(f"  {k:13s} mean={v.mean():7.3f} sd={v.std():6.3f} 歪度={sk:+6.2f} 尖度={ku:+7.2f} Shapiro p={p:.2e} {'→非正規' if p<.05 else '→正規'}")
print("  ※非正規が多いのでノンパラ検定（Kruskal-Wallis / Jonckheere）を主に使う")

print("\n"+"="*70); print("【2】格（rarity: 通常<伝説<幻）による群間差"); print("="*70)
order=["通常","伝説","幻"]; groups={r:[x for x in D if x["rarity"]==r] for r in order}
print("  群サイズ:", {k:len(v) for k,v in groups.items()})
res={}
for k in METRICS:
    gs=[col(groups[r],k) for r in order]
    H,pk=stats.kruskal(*gs)
    F,pa=stats.f_oneway(*gs)
    # 効果量 epsilon^2
    n=sum(len(g) for g in gs); eps2=(H-len(gs)+1)/(n-len(gs))
    # Jonckheere-Terpstra（順序対立仮説＝単調トレンド）を正規近似で
    JT=0
    for i in range(len(gs)):
        for j in range(i+1,len(gs)):
            JT+=sum((gs[i][:,None]<gs[j][None,:]).sum() for _ in [0])
    ns=[len(g) for g in gs]; N=sum(ns)
    mu=(N**2-sum(x**2 for x in ns))/4
    sd=np.sqrt((N**2*(2*N+3)-sum(x**2*(2*x+3) for x in ns))/72)
    z=(JT-mu)/sd; pjt=2*(1-stats.norm.cdf(abs(z)))
    res[k]=dict(H=H,p_kruskal=pk,eps2=eps2,z_jt=z,p_jt=pjt,
                means=[float(g.mean()) for g in gs])
    print(f"  {k:13s} KW H={H:7.2f} p={pk:.3e} ε²={eps2:.3f} | 単調トレンド z={z:+6.2f} p={pjt:.3e}")
    print(f"  {'':13s}   平均: " + " → ".join(f"{r}={g.mean():.3f}" for r,g in zip(order,gs)))
ps=[res[k]["p_kruskal"] for k in METRICS]; adj=holm(ps)
print("\n  Holm補正後の有意性:")
for k,a in zip(METRICS,adj): print(f"    {k:13s} p_adj={a:.3e} {'✅有意' if a<.05 else '❌n.s.'}")

print("\n"+"="*70); print("【3】ペアワイズ比較（Mann-Whitney U + 効果量 Cliff's delta）"); print("="*70)
def cliffs(a,b):
    gt=(a[:,None]>b[None,:]).sum(); lt=(a[:,None]<b[None,:]).sum()
    return (gt-lt)/(len(a)*len(b))
for k in ["contour","solidity","symmetry","eff_colors"]:
    print(f"  [{k}]")
    for i in range(len(order)):
        for j in range(i+1,len(order)):
            a,b=col(groups[order[i]],k),col(groups[order[j]],k)
            U,p=stats.mannwhitneyu(a,b,alternative="two-sided"); d=cliffs(a,b)
            mag="大" if abs(d)>=.474 else "中" if abs(d)>=.33 else "小" if abs(d)>=.147 else "無視できる"
            print(f"    {order[i]} vs {order[j]}: U={U:9.0f} p={p:.3e} δ={d:+.3f}({mag})")
json.dump(res, open("stats_rarity.json","w"), ensure_ascii=False, indent=1)
