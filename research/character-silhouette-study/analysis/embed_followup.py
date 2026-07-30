import json, os, numpy as np, torch, timm
from PIL import Image
from itertools import combinations
model = timm.create_model('vit_small_patch14_dinov2.lvd142m', pretrained=True, num_classes=0).eval()
cfg = timm.data.resolve_data_config({}, model=model); tf = timm.data.create_transform(**cfg, is_training=False)

def embed_dir(d):
    meta=json.load(open(f"{d}/meta.json")); ims=[];keep=[]
    for m in meta:
        p=f"{d}/{m['file']}"
        if os.path.exists(p): ims.append(tf(Image.open(p).convert("RGB"))); keep.append(m)
    with torch.no_grad(): f=model(torch.stack(ims))
    return torch.nn.functional.normalize(f,dim=-1).numpy(), keep

conds={}
for name,d in [("post","sil_post"),("pre","sil_pre"),("nofeat","sil_nofeat")]:
    conds[name]=embed_dir(d)

print("=== レア度構成（交絡の確認）===")
for n,(F,meta) in conds.items():
    from collections import Counter
    print(f"  {n:7s} {dict(Counter(m['rarity'] for m in meta))}")

print("\n=== 分布統計: 平均は交絡、最悪ペア(最小距離)が識別性の本質 ===")
print(f"{'cond':8s}{'mean':>8s}{'min':>8s}{'p5':>8s}{'p10':>8s}{'p25':>8s}")
for n,(F,meta) in conds.items():
    d=np.array([1-float(F[i]@F[j]) for i,j in combinations(range(len(F)),2)])
    print(f"{n:8s}{d.mean():8.4f}{d.min():8.4f}{np.percentile(d,5):8.4f}{np.percentile(d,10):8.4f}{np.percentile(d,25):8.4f}")

print("\n=== レア度を統制した比較（同一レア度ペアのみ）===")
def same_rarity_dists(F,meta):
    out={}
    for i,j in combinations(range(len(F)),2):
        if meta[i]['rarity']==meta[j]['rarity']:
            out.setdefault(meta[i]['rarity'],[]).append(1-float(F[i]@F[j]))
    return out
for n,(F,meta) in conds.items():
    sr=same_rarity_dists(F,meta)
    s=" ".join(f"{k}:n={len(v)},mean={np.mean(v):.3f},min={np.min(v):.3f}" for k,v in sorted(sr.items()))
    allv=[x for v in sr.values() for x in v]
    print(f"  {n:7s} {s}")
    if allv: print(f"          -> 同レア度ペア全体: n={len(allv)} mean={np.mean(allv):.4f} min={np.min(allv):.4f}")

print("\n=== 並べ替え検定: 同レア度ペアのみで post vs pre / nofeat ===")
def pool(n):
    F,meta=conds[n]; return np.array([1-float(F[i]@F[j]) for i,j in combinations(range(len(F)),2)
                                      if meta[i]['rarity']==meta[j]['rarity']])
def perm(a,b,n=20000,seed=0):
    rng=np.random.default_rng(seed); obs=a.mean()-b.mean(); poolv=np.concatenate([a,b]); na=len(a); c=0
    for _ in range(n):
        rng.shuffle(poolv)
        if abs(poolv[:na].mean()-poolv[na:].mean())>=abs(obs): c+=1
    return obs,(c+1)/(n+1)
A,B,C=pool("post"),pool("pre"),pool("nofeat")
for lbl,x,y in [("post vs pre",A,B),("post vs nofeat",A,C)]:
    if len(x) and len(y):
        o,p=perm(x,y); print(f"  {lbl}: post_mean={x.mean():.4f} other={y.mean():.4f} diff={o:+.4f} p={p:.4f} (n={len(x)},{len(y)})")
