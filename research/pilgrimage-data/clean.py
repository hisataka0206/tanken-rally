#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""AniTabi の巡礼地標JSON（api.anitabi.cn の /points/detail 応答）から、
   作品名↔場所（座標）だけを抜き出して統合する整形ツール。

方針（重要）:
  - 使うのは「地名・座標」という事実情報のみ。
  - スクリーンショット画像（image / origin=Anitabi の截図）は著作権リスクが高いので**取り込まない**。
  - AniTabi 由来であることを出所として残す（CC BY-NC-SA 4.0・非商用）。商用転用は不可の前提。

使い方:
  1) 各作品の座標JSONを web_fetch で取得し raw/<subjectID>.json として保存
     （例: https://api.anitabi.cn/bangumi/115908/points/detail）
  2) raw/<subjectID>.title に作品名を1行で書いておく（任意）
  3) python3 clean.py  → pilgrimage.json（統合・画像なし）を出力
"""
import json, glob, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, 'raw')

def clean_point(p):
    # 事実情報だけ残す（image/origin 截図は捨てる）
    geo = p.get('geo') or []
    if len(geo) != 2:
        return None
    return {
        'name': p.get('name') or p.get('cn') or '',
        'lat': geo[0],
        'lng': geo[1],
        'ep': p.get('ep'),           # 参考: 何話に出たか（数値/None/"OST"）
    }

def main():
    out = []
    for path in sorted(glob.glob(os.path.join(RAW, '*.json'))):
        sid = os.path.splitext(os.path.basename(path))[0]
        title = ''
        tpath = os.path.join(RAW, sid + '.title')
        if os.path.exists(tpath):
            title = open(tpath, encoding='utf-8').read().strip()
        try:
            data = json.load(open(path, encoding='utf-8'))
        except Exception as e:
            print(f'  skip {sid}: {e}'); continue
        pts = [clean_point(p) for p in data]
        pts = [p for p in pts if p]
        out.append({'subjectId': sid, 'title': title, 'pointCount': len(pts), 'points': pts})
        print(f'  {sid} {title}: {len(pts)}地点')
    open(os.path.join(HERE, 'pilgrimage.json'), 'w', encoding='utf-8').write(
        json.dumps({'source': 'AniTabi (api.anitabi.cn) / CC BY-NC-SA 4.0 / 非商用・画像除外',
                    'works': out}, ensure_ascii=False, indent=2))
    print(f'→ pilgrimage.json 出力（{len(out)}作品 / 計{sum(w["pointCount"] for w in out)}地点）')

if __name__ == '__main__':
    main()
