#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import csv, json, numpy as np
from collections import defaultdict
from scipy import stats
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import cross_val_score, StratifiedKFold
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import StandardScaler

R="/sessions/funny-zen-gauss/mnt/tanken-rally"
met={int(r["dex"]):{k:float(v) for k,v in r.items() if k!="dex"} for r in csv.DictReader(open("roster_metrics.csv"))}
meta={}
for r in csv.DictReader(open(f"{R}/docs/character-taxonomy/roster_5axis_analysis.csv",encoding="utf-8-sig")):
    try: meta[int(r["id"])]=r
    except: pass
roles={int(r["dex"]):r for r in csv.DictReader(open(f"{R}/tools/gen1_roles.csv"))}
D=[dict(dex=d,**met[d],**{k:meta[d].get(k,"") for k in ["shape","rarity","color","type_primary"]}) for d in sorted(met) if d in meta]
M=["contour","solidity","symmetry","eff_colors","edge_density"]
def col(rows,k): return np.array([r[k] for r in rows],float)

print("="*70); print("【4】公式14体型(shape)を形状指標で判別できるか"); print("="*70)
shapes=sorted({r["shape"] for r in D if r["shape"]})
X=np.array([[r[k] for k in ["contour","solidity","symmetry","aspect","occupancy"]] for r in D if r["shape"]])
y=np.array([r["shape"] for r in D if r["shape"]])
for k in ["contour","solidity","symmetry"]:
    gs=[col([r for r in D if r["shape"]==s],k) for s in shapes]
    H,p=stats.kruskal(*gs); n=len(y); eps2=(H-len(gs)+1)/(n-len(gs))
    print(f"  {k:10s} 14群のKruskal-Wallis H={H:7.2f} p={p:.3e} ε²={eps2:.3f}")
clf=RandomForestClassifier(n_estimators=300,random_state=0,n_jobs=-1)
cv=StratifiedKFold(5,shuffle=True,random_state=0)
acc=cross_val_score(clf,X,y,cv=cv,scoring="accuracy")
base=max(np.bincount([list(shapes).index(v) for v in y]))/len(y)
print(f"  5分割CV 判別精度 = {acc.mean():.3f} ± {acc.std():.3f}  (最頻クラス基準 {base:.3f})")
print(f"  → 形状指標だけで公式体型を {acc.mean()/base:.2f}倍 の精度で判別（チャンス超え）")

print("\n"+"="*70); print("【5】クラスタ数kの妥当性（14は正当か）"); print("="*70)
Xs=StandardScaler().fit_transform(X)
best=[]
for k in range(2,21):
    km=KMeans(n_clusters=k,random_state=0,n_init=10).fit(Xs)
    s=silhouette_score(Xs,km.labels_); best.append((k,s))
top=sorted(best,key=lambda t:-t[1])[:5]
print("  silhouette係数 上位5:", ", ".join(f"k={k}:{s:.3f}" for k,s in top))
print("  k=14 の値:", f"{dict(best)[14]:.3f}")
print("  ※形状5次元だけでは最適kは小さく出る。14は『公式分類＋シルエット形状』由来であり、")
print("    この5指標のみで14群が自然に分離するわけではない（論文では限界として明記すべき）")

print("\n"+"="*70); print("【6】Gen1: 種族値(BST)・進化段階との関係（連続量での検証）"); print("="*70)
G=[dict(**met[d], bst=float(roles[d]["bst"]), stage=int(roles[d]["stage"]), role=roles[d]["role"]) for d in roles if d in met]
print(f"  n={len(G)}")
for k in M:
    v=col(G,k); b=col(G,"bst")
    rs,ps=stats.spearmanr(v,b); rp,pp=stats.pearsonr(v,b)
    print(f"  {k:13s} vs BST: Spearman ρ={rs:+.3f} p={ps:.3e} | Pearson r={rp:+.3f} p={pp:.3e}")
print("\n  進化段階(1<2<3)による単調トレンド:")
for k in ["contour","solidity","symmetry","eff_colors"]:
    gs=[col([r for r in G if r["stage"]==s],k) for s in [1,2,3]]
    H,p=stats.kruskal(*gs)
    rs,ps=stats.spearmanr(col(G,k), col(G,"stage"))
    print(f"  {k:13s} KW p={p:.3e} | ρ(段階)={rs:+.3f} p={ps:.3e} | 平均 " + "→".join(f"{g.mean():.2f}" for g in gs))

print("\n"+"="*70); print("【7】色カテゴリと格の独立性（χ²）"); print("="*70)
cats=sorted({r["color"] for r in D if r["color"]}); rr=["通常","伝説","幻"]
tbl=np.array([[sum(1 for r in D if r["color"]==c and r["rarity"]==x) for c in cats] for x in rr])
chi2,p,dof,_=stats.chi2_contingency(tbl)
V=np.sqrt(chi2/(tbl.sum()*(min(tbl.shape)-1)))
print(f"  色 × 格: χ²={chi2:.2f} dof={dof} p={p:.3e} Cramér's V={V:.3f}")
print(f"  → 色の『種類』は格と{'関連あり' if p<.05 else '独立'}（ただし色の個数は格と無関係＝eff_colors n.s.）")
json.dump({"cv_acc":float(acc.mean()),"silhouette":dict(best)}, open("stats_part2.json","w"))
