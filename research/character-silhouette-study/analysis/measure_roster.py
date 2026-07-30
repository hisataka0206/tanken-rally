#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""公式ロスター1025体の形状・表面指標を統一手法（外輪郭ベタ塗り）で測定する。"""
import os, csv, glob, numpy as np
from PIL import Image

MAX = 256

def load(fn):
    im = Image.open(fn).convert("RGBA")
    s = min(1, MAX/max(im.size))
    if s < 1: im = im.resize((max(1,int(im.width*s)), max(1,int(im.height*s))), Image.LANCZOS)
    a = np.asarray(im)
    rgb = a[:,:,:3].astype(np.int32); al = a[:,:,3]
    if al.max() > 0 and al.min() < 250:
        mask = al > 40
    else:
        c = np.stack([rgb[0,0], rgb[0,-1], rgb[-1,0], rgb[-1,-1]]).mean(0)
        mask = np.sqrt(((rgb-c)**2).sum(-1)) > 32
    return rgb, mask

def hull_area(pts, fallback):
    if len(pts) < 3: return fallback
    p = sorted(set(map(tuple, pts)))
    def cr(o,a,b): return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
    lo=[]
    for q in p:
        while len(lo)>=2 and cr(lo[-2],lo[-1],q)<=0: lo.pop()
        lo.append(q)
    up=[]
    for q in reversed(p):
        while len(up)>=2 and cr(up[-2],up[-1],q)<=0: up.pop()
        up.append(q)
    h=lo[:-1]+up[:-1]; a=0.0
    for i in range(len(h)):
        x1,y1=h[i]; x2,y2=h[(i+1)%len(h)]; a += x1*y2-x2*y1
    return abs(a)/2 or fallback

def measure(fn):
    rgb, m = load(fn)
    area = int(m.sum())
    if area < 20: return None
    up=np.zeros_like(m); up[1:,:]=m[:-1,:]
    dn=np.zeros_like(m); dn[:-1,:]=m[1:,:]
    lf=np.zeros_like(m); lf[:,1:]=m[:,:-1]
    rt=np.zeros_like(m); rt[:,:-1]=m[:,1:]
    border = m & (~up|~dn|~lf|~rt)
    perim = int(border.sum())
    contour = perim/(2*np.sqrt(np.pi*area))
    ys,xs = np.where(border)
    sol = min(1.0, area/hull_area(np.stack([xs,ys],1), area))
    ys2,xs2 = np.where(m); y0,y1,x0,x1 = ys2.min(),ys2.max(),xs2.min(),xs2.max()
    sub = m[y0:y1+1, x0:x1+1]; fl = sub[:,::-1]
    sym = float((sub&fl).sum()/max(1,(sub|fl).sum()))
    h_,w_ = sub.shape
    aspect = w_/h_
    occupancy = area/m.size
    # 有効色数（量子化後、キャラ面積の1%以上を占める色）
    im2 = Image.fromarray(rgb.astype(np.uint8),"RGB").quantize(colors=24, method=Image.MEDIANCUT)
    lab = np.asarray(im2).astype(np.int32).copy(); lab[~m] = -1
    vals,cnts = np.unique(lab[lab>=0], return_counts=True)
    eff_colors = int((cnts >= area*0.01).sum())
    # 内部エッジ密度
    g = rgb.mean(-1)
    gx = np.zeros_like(g); gx[:,1:] = np.abs(g[:,1:]-g[:,:-1])
    gy = np.zeros_like(g); gy[1:,:] = np.abs(g[1:,:]-g[:-1,:])
    edge = float(((np.sqrt(gx**2+gy**2) > 24) & m).sum()/area)
    return dict(contour=contour, solidity=sol, symmetry=sym, aspect=aspect,
                occupancy=occupancy, eff_colors=eff_colors, edge_density=edge, area=area)

if __name__ == "__main__":
    import sys
    src = sys.argv[1] if len(sys.argv)>1 else "/sessions/funny-zen-gauss/mnt/tanken-rally/pokemon_all"
    out = sys.argv[2] if len(sys.argv)>2 else "roster_metrics.csv"
    files = sorted(glob.glob(f"{src}/*.png"), key=lambda p:int(os.path.basename(p).split('.')[0]))
    rows=[]
    for i,f in enumerate(files):
        try:
            m = measure(f)
            if m: m["dex"]=int(os.path.basename(f).split('.')[0]); rows.append(m)
        except Exception as e:
            print("ERR", f, e)
        if (i+1)%100==0: print(f"  {i+1}/{len(files)}", flush=True)
    keys=["dex","contour","solidity","symmetry","aspect","occupancy","eff_colors","edge_density","area"]
    with open(out,"w",newline="") as fh:
        w=csv.DictWriter(fh,fieldnames=keys); w.writeheader()
        for r in rows: w.writerow({k:r[k] for k in keys})
    print(f"done: {len(rows)} -> {out}")
