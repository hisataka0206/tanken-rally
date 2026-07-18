#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""全ランの指標を「ベタ塗りシルエット（外輪郭のみ）」で統一的に測り直す。
ブラウザ版はバージョンにより穴埋め有無が異なるため、比較可能性を担保する。"""
import json, os, sys, numpy as np
from PIL import Image

def metrics(mask):
    h,w=mask.shape; area=int(mask.sum())
    if area<5: return None
    up=np.zeros_like(mask); up[1:,:]=mask[:-1,:]
    dn=np.zeros_like(mask); dn[:-1,:]=mask[1:,:]
    lf=np.zeros_like(mask); lf[:,1:]=mask[:,:-1]
    rt=np.zeros_like(mask); rt[:,:-1]=mask[:,1:]
    perim=int((mask&(~up|~dn|~lf|~rt)).sum())
    contour=perim/(2*np.sqrt(np.pi*area))
    ys,xs=np.where(mask&(~up|~dn|~lf|~rt)); pts=sorted(set(zip(xs.tolist(),ys.tolist())))
    def hull(p):
        if len(p)<3: return area
        def cr(o,a,b): return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
        lo=[]
        for q in p:
            while len(lo)>=2 and cr(lo[-2],lo[-1],q)<=0: lo.pop()
            lo.append(q)
        u=[]
        for q in reversed(p):
            while len(u)>=2 and cr(u[-2],u[-1],q)<=0: u.pop()
            u.append(q)
        hl=lo[:-1]+u[:-1]; a=0
        for i in range(len(hl)):
            x1,y1=hl[i]; x2,y2=hl[(i+1)%len(hl)]; a+=x1*y2-x2*y1
        return abs(a)/2 or area
    sol=min(1.0, area/hull(pts))
    ys2,xs2=np.where(mask); y0,y1,x0,x1=ys2.min(),ys2.max(),xs2.min(),xs2.max()
    sub=mask[y0:y1+1,x0:x1+1]
    sym=float((sub&sub[:,::-1]).sum()/max(1,(sub|sub[:,::-1]).sum()))
    return dict(contour=float(contour), solidity=float(sol), symmetry=sym, area=area)

def solid_mask(fn, MAX=520):
    im=Image.open(fn).convert('RGBA'); s=min(1,MAX/max(im.size))
    im=im.resize((int(im.width*s),int(im.height*s)))
    return np.asarray(im)[:,:,3]>40

RUNS=[("lab1","E-A-post"),("lab2","E-A-pre"),("lab3","H2-off"),("lab4","E-B-form-sweep"),
      ("lab5","E-C-serpent-ladder"),("lab6","E-D-feature-sweep"),("lab7","E-C-quadruped-ladder"),
      ("c30","E-B-form-sweep-v2")]
out={}
for src,name in RUNS:
    if not os.path.exists(f"{src}/results.json"): continue
    rows=json.load(open(f"{src}/results.json")); rec=[]
    for r in rows:
        if r.get("error"): continue
        f=f"{src}/{r['i']+1:03d}_cut1.png"
        if not os.path.exists(f): continue
        m=metrics(solid_mask(f))
        if not m: continue
        b=r.get("metrics") or {}
        rec.append(dict(i=r["i"], rarity=r.get("rarity"), body=r.get("bodyJa"), feat=r.get("featJa"),
                        canonical=m, browser_reported=dict(contour=b.get("contour"),
                        solidity=b.get("solidity"), symmetry=b.get("symmetry"))))
    if not rec: continue
    cc=[x["canonical"]["contour"] for x in rec]
    bb=[x["browser_reported"]["contour"] for x in rec if x["browser_reported"]["contour"]]
    drift=(np.mean(bb)-np.mean(cc)) if bb else float('nan')
    out[name]=rec
    flag="★穴埋め汚染の疑い" if drift>0.35 else ""
    print(f"{name:22s} n={len(rec):2d}  canonical={np.mean(cc):.2f}  browser={np.mean(bb):.2f}  差={drift:+.2f} {flag}")
json.dump(out, open("canonical_metrics.json","w"), ensure_ascii=False, indent=1)
print("\n-> canonical_metrics.json")
