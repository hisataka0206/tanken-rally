#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
character_complexity.py — キャラ画像の「デザイン複雑さ」実測ツール（PIL + numpy のみ）

各PNG（できれば透過背景＝キャラ単体）について、次を実測する:
  occupancy      : キャラ面積 / 画像面積（大きさ）
  aspect         : 縦横比（bbox）
  eff_colors     : 有効色数（量子化後、キャラ面積の1%以上を占める色数）
  regions        : 主要な色領域数（連結成分・面積0.5%以上）
  small_regions  : 細かい色パッチ数（0.1〜0.5%）＝ディテール量
  contour        : 輪郭複雑度 = 周囲長 / (2*sqrt(pi*面積))  真円=1.0、突起で>1
  solidity       : 面積 / 凸包面積  1.0=単純な凸、翼/角で低下
  symmetry       : 左右対称スコア（左右反転マスクとのIoU）0〜1
  edge_density   : 内部エッジ密度（勾配強い画素 / キャラ画素）
  complexity     : 総合スコア（各指標を0〜1正規化した加重和・目安）

使い方:
  1) 単純に測る:      python3 character_complexity.py <画像フォルダ> [--out out.csv]
  2) 役割で集計する:   python3 character_complexity.py <画像フォルダ> --roles gen1_roles.csv --out out.csv
     ・roles CSV は列に dex(または filename),role を持つ。ファイル名の数字を dex として突き合わせる。
     ・例: PokéAPI のスプライト（1.png..151.png）フォルダ + gen1_roles.csv → 役割バケット集計。
"""
import sys, os, csv, math, argparse, re
from collections import deque, defaultdict
import numpy as np
from PIL import Image

MAXDIM = 160  # 解析前に縮小（複雑さは相対量なので十分・高速化）

def load_mask_rgb(path):
    im = Image.open(path).convert('RGBA')
    # 縮小
    w, h = im.size
    s = MAXDIM / max(w, h)
    if s < 1:
        im = im.resize((max(1, int(w*s)), max(1, int(h*s))), Image.LANCZOS)
    arr = np.asarray(im).astype(np.float32)
    rgb = arr[..., :3]
    alpha = arr[..., 3]
    if alpha.max() > 0 and alpha.min() < 250:
        mask = alpha > 40
    else:
        # 透過が無い画像: 四隅の平均を背景色とみなし、色距離で前景を取る
        corners = np.stack([rgb[0,0], rgb[0,-1], rgb[-1,0], rgb[-1,-1]])
        bg = corners.mean(0)
        dist = np.sqrt(((rgb - bg)**2).sum(-1))
        mask = dist > 32
    return rgb, mask

def bbox(mask):
    ys, xs = np.where(mask)
    if len(xs) == 0: return None
    return xs.min(), ys.min(), xs.max(), ys.max()

def quantize_labels(rgb, mask, k=24):
    """量子化した色インデックス（0..k-1）をピクセルごとに返す。背景は -1。"""
    im = Image.fromarray(rgb.astype(np.uint8), 'RGB').quantize(colors=k, method=Image.MEDIANCUT)
    lab = np.asarray(im).astype(np.int32)
    lab = lab.copy()
    lab[~mask] = -1
    return lab

def connected_components(lab, mask):
    """同一ラベルの4連結成分にIDを振る。戻り: comp_id 配列(-1=bg), 各成分の面積dict。"""
    H, W = lab.shape
    comp = -np.ones((H, W), dtype=np.int32)
    areas = {}
    cid = 0
    for y in range(H):
        for x in range(W):
            if not mask[y, x] or comp[y, x] != -1:
                continue
            lv = lab[y, x]
            dq = deque([(y, x)]); comp[y, x] = cid; a = 0
            while dq:
                cy, cx = dq.popleft(); a += 1
                for ny, nx in ((cy-1,cx),(cy+1,cx),(cy,cx-1),(cy,cx+1)):
                    if 0 <= ny < H and 0 <= nx < W and comp[ny, nx] == -1 and mask[ny, nx] and lab[ny, nx] == lv:
                        comp[ny, nx] = cid; dq.append((ny, nx))
            areas[cid] = a; cid += 1
    return comp, areas

def perimeter(mask):
    m = mask.astype(np.uint8)
    p = 0
    H, W = m.shape
    # 4近傍のいずれかが背景（または画像外）なら境界画素
    up    = np.zeros_like(m); up[1:,:]   = m[:-1,:]
    down  = np.zeros_like(m); down[:-1,:] = m[1:,:]
    left  = np.zeros_like(m); left[:,1:]  = m[:,:-1]
    right = np.zeros_like(m); right[:,:-1]= m[:,1:]
    border = m & ((up==0)|(down==0)|(left==0)|(right==0))
    return int(border.sum())

def convex_hull_area(mask):
    ys, xs = np.where(mask)
    pts = list(set(zip(xs.tolist(), ys.tolist())))
    if len(pts) < 3: return float(mask.sum())
    pts.sort()
    def cross(o,a,b): return (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0])
    lower=[]
    for p in pts:
        while len(lower)>=2 and cross(lower[-2],lower[-1],p)<=0: lower.pop()
        lower.append(p)
    upper=[]
    for p in reversed(pts):
        while len(upper)>=2 and cross(upper[-2],upper[-1],p)<=0: upper.pop()
        upper.append(p)
    hull = lower[:-1]+upper[:-1]
    area=0.0
    for i in range(len(hull)):
        x1,y1=hull[i]; x2,y2=hull[(i+1)%len(hull)]
        area += x1*y2 - x2*y1
    return abs(area)/2.0

def symmetry(mask):
    b = bbox(mask)
    if not b: return 0.0
    x0,y0,x1,y1 = b
    crop = mask[y0:y1+1, x0:x1+1]
    flip = crop[:, ::-1]
    inter = (crop & flip).sum(); union = (crop | flip).sum()
    return float(inter/union) if union else 0.0

def edge_density(rgb, mask):
    gray = rgb.mean(-1)
    gy, gx = np.gradient(gray)
    mag = np.sqrt(gx*gx + gy*gy)
    strong = (mag > 18) & mask
    a = int(mask.sum())
    return float(strong.sum()/a) if a else 0.0

def measure(path):
    rgb, mask = load_mask_rgb(path)
    area = int(mask.sum())
    if area < 20:
        return None
    H, W = mask.shape
    occ = area/(H*W)
    b = bbox(mask); aspect = (b[2]-b[0]+1)/(b[3]-b[1]+1)
    lab_fine = quantize_labels(rgb, mask, k=64)    # 色の豊かさ用（細かめ）
    lab_coarse = quantize_labels(rgb, mask, k=8)   # 塗り分け領域用（粗い＝陰影ノイズを抑える）
    # 有効色数（面積1%以上の色）
    idx = lab_fine[mask]
    counts = np.bincount(idx[idx>=0], minlength=1)
    eff_colors = int((counts >= area*0.01).sum())
    # 領域数（粗いパレットの連結成分）
    comp, areas = connected_components(lab_coarse, mask)
    regions = sum(1 for a in areas.values() if a >= area*0.005)
    small = sum(1 for a in areas.values() if area*0.001 <= a < area*0.005)
    peri = perimeter(mask)
    contour = peri / (2*math.sqrt(math.pi*area))
    hull = convex_hull_area(mask)
    solidity = min(1.0, area/hull) if hull else 1.0
    sym = symmetry(mask)
    edge = edge_density(rgb, mask)
    # 総合（0〜1正規化・目安レンジ）
    def nrm(v, lo, hi): return max(0.0, min(1.0, (v-lo)/(hi-lo)))
    complexity = (0.30*nrm(eff_colors,3,24) + 0.25*nrm(regions,2,16)
                  + 0.25*nrm(contour,1.0,2.2) + 0.20*nrm(edge,0.05,0.35))
    return dict(occupancy=occ, aspect=aspect, eff_colors=eff_colors, regions=regions,
                small_regions=small, contour=contour, solidity=solidity,
                symmetry=sym, edge_density=edge, complexity=complexity)

METRIC_KEYS = ['occupancy','aspect','eff_colors','regions','small_regions','contour','solidity','symmetry','edge_density','complexity']

def load_roles(path):
    m = {}
    with open(path, encoding='utf-8') as f:
        for row in csv.DictReader(f):
            key = row.get('dex') or row.get('filename') or ''
            m[str(key).strip()] = row.get('role','').strip()
    return m

def dex_of(fname):
    mm = re.match(r'0*(\d+)', os.path.splitext(os.path.basename(fname))[0])
    return mm.group(1) if mm else None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('folder')
    ap.add_argument('--roles', default=None)
    ap.add_argument('--out', default=None)
    args = ap.parse_args()
    roles = load_roles(args.roles) if args.roles else None
    files = sorted(f for f in os.listdir(args.folder) if f.lower().endswith(('.png','.jpg','.jpeg','.webp')))
    rows = []
    for f in files:
        try:
            m = measure(os.path.join(args.folder, f))
        except Exception as e:
            print(f"[skip] {f}: {e}"); continue
        if not m: continue
        role = ''
        if roles is not None:
            role = roles.get(dex_of(f) or '', '') or roles.get(f, '')
        rows.append(dict(file=f, role=role, **m))
    if not rows:
        print("測定対象なし"); return
    # CSV出力
    if args.out:
        with open(args.out, 'w', newline='', encoding='utf-8') as g:
            w = csv.DictWriter(g, fieldnames=['file','role']+METRIC_KEYS); w.writeheader()
            for r in rows: w.writerow(r)
        print(f"→ {args.out} に {len(rows)} 件を書き出し")
    # 全体平均
    def avg(rs, k): return sum(r[k] for r in rs)/len(rs)
    print(f"\n=== 全体（n={len(rows)}）===")
    print(' '.join(f"{k}={avg(rows,k):.2f}" for k in METRIC_KEYS))
    # 役割バケット集計
    if roles is not None:
        by = defaultdict(list)
        for r in rows: by[r['role'] or '(未分類)'].append(r)
        print("\n=== 役割バケット別 平均 ===")
        hdr = ['role','n'] + METRIC_KEYS
        print('\t'.join(hdr))
        order = ['zako','bug_fast','cute','cool','starter','solo','pseudo','legend','gag','(未分類)']
        for role in sorted(by, key=lambda x: order.index(x) if x in order else 99):
            rs = by[role]
            print('\t'.join([role, str(len(rs))] + [f"{avg(rs,k):.2f}" for k in METRIC_KEYS]))

if __name__ == '__main__':
    main()
