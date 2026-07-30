import json, os, numpy as np
from PIL import Image
from collections import deque

def corrected_sil(fn, MAX=520, canvas=256):
    """穴補正済みの黒シルエットを、正方キャンバスに重心中心・スケール正規化して返す。"""
    im = Image.open(fn).convert("RGBA")
    s = min(1, MAX/max(im.size)); w,h = int(im.width*s), int(im.height*s)
    im = im.resize((w,h)); a = np.asarray(im).astype(np.int32); N = w*h
    op = a[:,:,3] > 40
    dist2 = (a[:,:,0]-255)**2 + (a[:,:,1]-255)**2 + (a[:,:,2]-255)**2
    bgw = op & (dist2 < 58*58)
    seen = np.zeros((h,w), bool); minA = max(6, int(N*0.0002)); al = a[:,:,3].copy()
    for y in range(h):
        for x in range(w):
            if not bgw[y,x] or seen[y,x]: continue
            dq=deque([(y,x)]); seen[y,x]=True; comp=[(y,x)]
            while dq:
                cy,cx=dq.popleft()
                for ny,nx in ((cy-1,cx),(cy+1,cx),(cy,cx-1),(cy,cx+1)):
                    if 0<=ny<h and 0<=nx<w and bgw[ny,nx] and not seen[ny,nx]:
                        seen[ny,nx]=True; dq.append((ny,nx)); comp.append((ny,nx))
            if len(comp)>=minA:
                for (cy,cx) in comp: al[cy,cx]=0
    m = al > 40
    ys,xs = np.where(m)
    if len(xs)==0: return None
    y0,y1,x0,x1 = ys.min(), ys.max(), xs.min(), xs.max()
    crop = m[y0:y1+1, x0:x1+1]
    # 正規化: 最長辺を canvas*0.85 に合わせ、中央配置（位置・サイズを除去し"形"だけ比較する）
    ch, cw = crop.shape
    target = int(canvas*0.85); r = target/max(ch,cw)
    nh, nw = max(1,int(ch*r)), max(1,int(cw*r))
    cim = Image.fromarray((crop*255).astype(np.uint8)).resize((nw,nh), Image.LANCZOS)
    out = Image.new("L", (canvas,canvas), 255)   # 白背景
    blk = Image.new("L", (nw,nh), 0)             # 黒シルエット
    out.paste(blk, ((canvas-nw)//2, (canvas-nh)//2), cim)
    return out.convert("RGB")

def build(labdir, outdir):
    os.makedirs(outdir, exist_ok=True)
    d = json.load(open(f"{labdir}/results.json"))
    meta=[]
    for r in d:
        if r.get("error"): continue
        src = f"{labdir}/{r['i']+1:03d}_sil0.png"
        if not os.path.exists(src): continue
        sil = corrected_sil(src)
        if sil is None: continue
        name = f"{r['i']:02d}.png"
        sil.save(f"{outdir}/{name}")
        meta.append({"file":name, "rarity":r.get("rarity"), "body":r.get("bodyJa"), "feat":r.get("featJa")})
    json.dump(meta, open(f"{outdir}/meta.json","w"), ensure_ascii=False, indent=1)
    return len(meta)

if __name__ == "__main__":
    # 使い方: python3 make_silhouettes.py <char-lab展開ディレクトリ> <出力ディレクトリ>
    # 例:     python3 make_silhouettes.py ./lab1 ./sil_post
    import sys
    if len(sys.argv) >= 3:
        print(f"{sys.argv[1]} -> {sys.argv[2]}: {build(sys.argv[1], sys.argv[2])} silhouettes")
    else:
        print(__doc__ or "usage: make_silhouettes.py <src_dir> <out_dir>")
