#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import csv, json, numpy as np
from scipy import stats
R="/sessions/funny-zen-gauss/mnt/tanken-rally"
met={int(r["dex"]):{k:float(v) for k,v in r.items() if k!="dex"} for r in csv.DictReader(open("roster_metrics.csv"))}
meta={}
for r in csv.DictReader(open(f"{R}/docs/character-taxonomy/roster_5axis_analysis.csv",encoding="utf-8-sig")):
    try: meta[int(r["id"])]=r
    except: pass
D=[dict(dex=d,**met[d],rarity=meta[d].get("rarity","")) for d in sorted(met) if d in meta]
norm=[r for r in D if r["rarity"]=="通常"]
def col(rows,k): return np.array([r[k] for r in rows],float)

print("="*70); print("【8】等価性検定(TOST): 色数は本当に格で変わらないか"); print("="*70)
a=col([r for r in D if r["rarity"]=="通常"],"eff_colors"); b=col([r for r in D if r["rarity"]in("伝説","幻")],"eff_colors")
sd=np.sqrt(((len(a)-1)*a.var(ddof=1)+(len(b)-1)*b.var(ddof=1))/(len(a)+len(b)-2))
for margin in [0.2,0.3,0.5]:
    d=margin*sd; diff=a.mean()-b.mean(); se=sd*np.sqrt(1/len(a)+1/len(b)); df=len(a)+len(b)-2
    t1=(diff+d)/se; t2=(diff-d)/se
    p=max(1-stats.t.cdf(t1,df), stats.t.cdf(t2,df))
    print(f"  等価マージン ±{margin}SD (={d:.2f}色): 差={diff:+.3f} TOST p={p:.4f} {'✅等価と言える' if p<.05 else '❌等価と言えない'}")

print("\n"+"="*70); print("【9】生成キャラは参照分布のどこにいるか（パーセンタイル）"); print("="*70)
C=json.load(open("canonical_metrics.json"))
def pct(v,ref): return float((ref<v).mean()*100)
for run in ["E-B-form-sweep-v2","E-A-post","E-A-pre"]:
    rows=[r for r in C[run] if r["rarity"]=="common"] or C[run]
    if not rows: continue
    print(f"  [{run}] n={len(rows)}")
    for k in ["contour","solidity","symmetry"]:
        v=np.mean([r["canonical"][k] for r in rows]); ref=col(norm,k)
        print(f"    {k:10s} 生成平均={v:.2f}  参照(通常)平均={ref.mean():.2f}  → 参照分布の {pct(v,ref):5.1f} パーセンタイル")

print("\n"+"="*70); print("【10】必要サンプル数（S4を決着させるには何体要るか）"); print("="*70)
gen=[r["canonical"]["contour"] for r in C["E-B-form-sweep-v2"]]
sd_gen=np.std(gen,ddof=1)
print(f"  生成キャラ(common,n={len(gen)})の輪郭SD = {sd_gen:.3f}")
print(f"  参照(通常,n={len(norm)})の輪郭SD      = {col(norm,'contour').std(ddof=1):.3f}")
za=stats.norm.ppf(0.975)
for delta in [0.20,0.30,0.40,0.50]:
    for power in [0.80,0.90]:
        zb=stats.norm.ppf(power)
        n=2*((za+zb)**2)*(sd_gen**2)/(delta**2)
        print(f"  効果量 Δ={delta:.2f} を検出力{power:.0%}で検出 → 1条件あたり n={int(np.ceil(n)):4d} 体 (計 {int(np.ceil(n))*2} 体)")
print(f"\n  ※実測されたE-A効果 Δ=+0.20 は、上表より1条件 n≈{int(np.ceil(2*((za+stats.norm.ppf(0.8))**2)*(sd_gen**2)/(0.20**2)))} 体必要")
print(f"    参照ロスターの 通常vs伝説 の効果量 Δ={col([r for r in D if r['rarity']in('伝説','幻')],'contour').mean()-col(norm,'contour').mean():.2f} なら n≈{int(np.ceil(2*((za+stats.norm.ppf(0.8))**2)*(sd_gen**2)/(0.55**2)))} 体で足りる")
