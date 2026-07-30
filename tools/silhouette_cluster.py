#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""全ポケモンのシルエットを形だけでクラスタリングし「基本フォルムは何種類必要か」を実測する。"""
import numpy as np, glob, os, sys, math
from PIL import Image

def mask_of(path, S=96):
    im = Image.open(path).convert('RGBA'); a = np.asarray(im); al = a[..., 3]
    m = al > 40 if (al.max() > 0 and al.min() < 250) else (np.sqrt(((a[...,:3].astype(float)-a[0,0,:3])**2).sum(-1)) > 32)
    ys, xs = np.where(m)
    if len(xs) < 20: return None
    m = m[ys.min():ys.max()+1, xs.min():xs.max()+1]
    im = Image.fromarray((m*255).astype('uint8'), 'L')
    w, h = im.size; s = S/max(w, h)
    im = im.resize((max(1,int(w*s)), max(1,int(h*s))), Image.NEAREST)
    return np.asarray(im) > 127

def hull_area(mask):
    ys, xs = np.where(mask); pts = sorted(set(zip(xs.tolist(), ys.tolist())))
    if len(pts) < 3: return float(mask.sum())
    def cr(o,a,b): return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
    lo=[]
    for p in pts:
        while len(lo)>=2 and cr(lo[-2],lo[-1],p)<=0: lo.pop()
        lo.append(p)
    up=[]
    for p in reversed(pts):
        while len(up)>=2 and cr(up[-2],up[-1],p)<=0: up.pop()
        up.append(p)
    h=lo[:-1]+up[:-1]; ar=0.0
    for i in range(len(h)):
        x1,y1=h[i]; x2,y2=h[(i+1)%len(h)]; ar+=x1*y2-x2*y1
    return abs(ar)/2 or float(mask.sum())

def hu(mask):
    m=mask.astype(float); Y,X=np.nonzero(m);
    x=X.astype(float); y=Y.astype(float); M00=len(x)
    xb=x.mean(); yb=y.mean()
    def mu(p,q): return (((x-xb)**p)*((y-yb)**q)).sum()
    def nu(p,q): return mu(p,q)/(M00**(1+(p+q)/2))
    n20,n02,n11=nu(2,0),nu(0,2),nu(1,1)
    n30,n12,n21,n03=nu(3,0),nu(1,2),nu(2,1),nu(0,3)
    h=[0.0]*7
    h[0]=n20+n02
    h[1]=(n20-n02)**2+4*n11**2
    h[2]=(n30-3*n12)**2+(3*n21-n03)**2
    h[3]=(n30+n12)**2+(n21+n03)**2
    h[4]=(n30-3*n12)*(n30+n12)*((n30+n12)**2-3*(n21+n03)**2)+(3*n21-n03)*(n21+n03)*(3*(n30+n12)**2-(n21+n03)**2)
    h[5]=(n20-n02)*((n30+n12)**2-(n21+n03)**2)+4*n11*(n30+n12)*(n21+n03)
    h[6]=(3*n21-n03)*(n30+n12)*((n30+n12)**2-3*(n21+n03)**2)-(n30-3*n12)*(n21+n03)*(3*(n30+n12)**2-(n21+n03)**2)
    return [(-math.copysign(1,v))*math.log10(abs(v)+1e-30) for v in h]

def feats(path):
    m=mask_of(path)
    if m is None: return None
    H,W=m.shape; area=int(m.sum())
    aspect=math.log((W)/(H))
    extent=area/(H*W)
    sol=area/max(1.0,hull_area(m))
    grid=np.asarray(Image.fromarray((m*255).astype('uint8')).resize((12,12),Image.BILINEAR)).astype(float)/255.0
    return np.array([aspect,extent,sol]+hu(m)+grid.flatten().tolist(), dtype=float)

def kmeans(X,k,iters=40,seed=0):
    rng=np.random.default_rng(seed); n=len(X)
    # k-means++
    c=[X[rng.integers(n)]]
    for _ in range(k-1):
        d=np.min([((X-ci)**2).sum(1) for ci in c],axis=0); p=d/d.sum()
        c.append(X[rng.choice(n,p=p)])
    C=np.array(c)
    for _ in range(iters):
        A=np.argmin(((X[:,None,:]-C[None,:,:])**2).sum(2),axis=1)
        newC=np.array([X[A==j].mean(0) if (A==j).any() else C[j] for j in range(k)])
        if np.allclose(newC,C): C=newC; break
        C=newC
    inertia=((X-C[A])**2).sum()
    return A,C,inertia

def main():
    files=sorted(glob.glob('_local/pokemon_all/*.png'), key=lambda p:int(os.path.splitext(os.path.basename(p))[0]) if os.path.basename(p)[0].isdigit() else 0)
    F=[]; keep=[]
    for f in files:
        v=feats(f)
        if v is not None: F.append(v); keep.append(f)
    X=np.array(F)
    # 標準化（グリッドが支配しないよう scalar 群を少し強める）
    mu=X.mean(0); sd=X.std(0)+1e-9; Xs=(X-mu)/sd
    Xs[:, :10]*=2.0   # aspect/extent/solidity/Hu を重めに
    print(f"対象 {len(keep)} 体")
    print("k : inertia（下げ止まり＝elbow）")
    inert={}
    for k in [8,10,12,14,16,18,20,24]:
        _,_,inr=kmeans(Xs,k,seed=1); inert[k]=inr
        print(f"{k:3d}: {inr:,.0f}")
    np.save('/tmp/Xs.npy',Xs);
    import pickle; pickle.dump(keep,open('/tmp/keep.pkl','wb'))
    print("features cached")

if __name__=='__main__': main()
