import json, os, numpy as np, torch, timm
from PIL import Image
from itertools import combinations

torch.manual_seed(0); np.random.seed(0)
model = timm.create_model('vit_small_patch14_dinov2.lvd142m', pretrained=True, num_classes=0).eval()
cfg = timm.data.resolve_data_config({}, model=model)
tf = timm.data.create_transform(**cfg, is_training=False)
print("input size:", cfg['input_size'])

def embed_dir(d):
    meta = json.load(open(f"{d}/meta.json"))
    ims, keep = [], []
    for m in meta:
        p = f"{d}/{m['file']}"
        if not os.path.exists(p): continue
        ims.append(tf(Image.open(p).convert("RGB"))); keep.append(m)
    x = torch.stack(ims)
    with torch.no_grad():
        f = model(x)
    f = torch.nn.functional.normalize(f, dim=-1).numpy()
    return f, keep

def pairwise_cos_dist(F):
    return np.array([1 - float(F[i] @ F[j]) for i, j in combinations(range(len(F)), 2)])

def boot_ci(v, n=10000, seed=0):
    rng = np.random.default_rng(seed)
    means = [rng.choice(v, size=len(v), replace=True).mean() for _ in range(n)]
    return float(np.percentile(means, 2.5)), float(np.percentile(means, 97.5))

def perm_test(a, b, n=20000, seed=0):
    """2群の平均差の並べ替え検定（両側）"""
    rng = np.random.default_rng(seed)
    obs = a.mean() - b.mean()
    pool = np.concatenate([a, b]); na = len(a)
    cnt = 0
    for _ in range(n):
        rng.shuffle(pool)
        if abs(pool[:na].mean() - pool[na:].mean()) >= abs(obs): cnt += 1
    return obs, (cnt + 1) / (n + 1)

conds = {}
for name, d in [("post (14 forms)", "sil_post"), ("pre (old 10)", "sil_pre"), ("no-feature", "sil_nofeat")]:
    F, meta = embed_dir(d)
    dist = pairwise_cos_dist(F)
    conds[name] = dict(F=F, meta=meta, dist=dist)
    lo, hi = boot_ci(dist)
    print(f"\n{name}: n={len(F)} pairs={len(dist)}")
    print(f"  mean pairwise cosine distance = {dist.mean():.4f}  95%CI[{lo:.4f},{hi:.4f}]  min={dist.min():.4f} max={dist.max():.4f}")
    # 最も似ているペア（＝見分けにくい組）
    pairs = list(combinations(range(len(F)), 2))
    order = np.argsort(dist)[:3]
    for k in order:
        i, j = pairs[k]
        print(f"    closest pair d={dist[k]:.4f}: {meta[i]['body']}/{meta[i]['rarity']}  <->  {meta[j]['body']}/{meta[j]['rarity']}")

print("\n=== 主比較: post vs pre ===")
a, b = conds["post (14 forms)"]["dist"], conds["pre (old 10)"]["dist"]
obs, p = perm_test(a, b)
print(f"平均差 = {obs:+.4f}  (post={a.mean():.4f} vs pre={b.mean():.4f})  permutation p = {p:.4f}")

print("\n=== 参考: no-feature vs post ===")
c = conds["no-feature"]["dist"]
obs2, p2 = perm_test(a, c)
print(f"平均差 = {obs2:+.4f}  (post={a.mean():.4f} vs no-feature={c.mean():.4f})  permutation p = {p2:.4f}")

np.save("emb_post.npy", conds["post (14 forms)"]["F"]); np.save("emb_pre.npy", conds["pre (old 10)"]["F"])
json.dump({k: dict(mean=float(v["dist"].mean()), n=len(v["F"])) for k, v in conds.items()}, open("emb_summary.json","w"), indent=1)
