#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""聖地スポットを「1日で回れる地域」に束ねられるかの検証（電車・バス利用可）。

考え方:
  - 地域クラスタ = 「同じ日帰り圏」。近いスポット同士を eps でチェイン（単連結）。
    電車・バス可なので eps は都市圏スケール（既定 12km）に広げる。
  - 1日周遊可否 = 地域内のスポットを最近傍順に回り、
      移動時間（近距離は徒歩4km/h・遠距離は公共交通の実効18km/h＝待ち/乗換/駅歩き込み）
      ＋ 各スポット滞在20分 が 1日の予算（既定8時間=480分）に収まるか。
  - 収まらない地域は「絞り込みが必要（＝上位スポットだけ選ぶ）」と判定。
"""
import json, math, os, sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
REGION_EPS_KM = 12.0     # これ以内で連結＝同一地域（電車バス前提で広め）
DAY_BUDGET_MIN = 480     # 1日の行動予算
DWELL_MIN = 20           # 1スポット滞在
WALK_KMH = 4.0           # 近距離（<1.5km）は徒歩
TRANSIT_KMH = 18.0       # それ以上は公共交通の実効速度（待ち・乗換・駅歩き込み）
WALK_MAX_KM = 1.5

def hav(a, b):
    R=6371.0; p1,p2=math.radians(a[0]),math.radians(b[0])
    dp=math.radians(b[0]-a[0]); dl=math.radians(b[1]-a[1])
    x=math.sin(dp/2)**2+math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return R*2*math.atan2(math.sqrt(x),math.sqrt(1-x))

def travel_min(d_km):
    kmh = WALK_KMH if d_km <= WALK_MAX_KM else TRANSIT_KMH
    return d_km/kmh*60

def cluster(spots, eps=REGION_EPS_KM):
    """単連結（union-find）で eps 以内を同一地域に。O(n^2)。"""
    n=len(spots); parent=list(range(n))
    def find(x):
        while parent[x]!=x: parent[x]=parent[parent[x]]; x=parent[x]
        return x
    def uni(a,b):
        ra,rb=find(a),find(b)
        if ra!=rb: parent[ra]=rb
    for i in range(n):
        for j in range(i+1,n):
            if hav(spots[i],spots[j])<=eps: uni(i,j)
    groups=defaultdict(list)
    for i in range(n): groups[find(i)].append(i)
    return [[spots[i] for i in idx] for idx in groups.values()]

def nn_tour_km(pts):
    """最近傍順で巡回したときの総移動距離（往路のみ・駅起点は考えない簡易版）。"""
    if len(pts)<2: return 0.0, [0]
    used=[False]*len(pts); order=[0]; used[0]=True; total=0.0
    for _ in range(len(pts)-1):
        cur=order[-1]; best=-1; bd=1e18
        for j in range(len(pts)):
            if used[j]: continue
            d=hav(pts[cur],pts[j])
            if d<bd: bd=d; best=j
        order.append(best); used[best]=True; total+=bd
    return total, order

def day_fit(region):
    """地域を1日で何スポット回れるか。最近傍順に予算まで詰める。"""
    _,order=nn_tour_km(region)
    t=0.0; visited=0
    for k,idx in enumerate(order):
        if k>0: t+=travel_min(hav(region[order[k-1]],region[idx]))
        t+=DWELL_MIN
        if t>DAY_BUDGET_MIN: break
        visited+=1
    span=max((hav(region[i],region[j]) for i in range(len(region)) for j in range(i+1,len(region))), default=0.0)
    return visited, len(region), round(span,1)

def analyze(work):
    spots=[(s[0],s[1]) for s in work['spots']]
    regions=cluster(spots)
    regions.sort(key=len, reverse=True)
    rep=[]
    for r in regions:
        v,n,span=day_fit(r)
        rep.append({'spots':n,'span_km':span,'oneDayVisit':v,'fitsAll':v>=n})
    return regions, rep

def main():
    data=json.load(open(os.path.join(HERE,'works_clean.json'),encoding='utf-8'))
    works=data['works']
    # 代表作品を自動選抜: 密集(宇治)・中規模・広域 を拾う
    targets_id={100444:'四月は君の嘘',115908:'響け！ユーフォニアム'}
    picked=[w for w in works if w['id'] in targets_id]
    # 追加: スポット多い＆広域そうな作品を数本
    extra=sorted(works,key=lambda w:-len(w['spots']))[:4]
    for w in extra:
        if w not in picked: picked.append(w)

    print("=== 個別作品の地域クラスタ検証（電車・バス可 / 1日=8h・滞在20分/件）===")
    for w in picked[:6]:
        regions,rep=analyze(w)
        big=rep[0] if rep else None
        print(f"\n■ {w['title']}（{w['type']}） 総{len(w['spots'])}スポット → {len(regions)}地域")
        for i,r in enumerate(rep[:4]):
            mark='◎全部回れる' if r['fitsAll'] else f"△{r['oneDayVisit']}/{r['spots']}件だけ1日で"
            print(f"   地域{i+1}: {r['spots']}スポット / 広がり{r['span_km']}km / {mark}")
        if len(rep)>4: print(f"   …他 {len(rep)-4}地域")

    # 全体集計
    print("\n=== 全1492作品の集計 ===")
    region_counts=[]; single=0; total_regions=0; fit_regions=0; all_regions=0
    for w in works:
        regions=cluster([(s[0],s[1]) for s in w['spots']])
        region_counts.append(len(regions))
        if len(regions)==1: single+=1
        for r in regions:
            v,n,_=day_fit(r); all_regions+=1
            if v>=n: fit_regions+=1
        total_regions+=len(regions)
    import statistics as st
    print(f"1作品あたり地域数: 平均 {st.mean(region_counts):.1f} / 中央値 {st.median(region_counts):.0f} / 最大 {max(region_counts)}")
    print(f"単一地域で収まる作品: {single}/{len(works)}（{single*100//len(works)}%）")
    print(f"総地域数 {all_regions} のうち、1日で全スポット回れる地域: {fit_regions}（{fit_regions*100//all_regions}%）")

if __name__=='__main__':
    main()
