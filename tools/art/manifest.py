#!/usr/bin/env python3
"""Writes art/sprites.json: which object on which art sheet becomes which sprite, with its box in sheet pixels and
how to cut it. Run this, then tools/art/cut.py.

    python3 -I tools/art/manifest.py && python3 -I tools/art/cut.py"""
import json, os

S = []
def add(name, sheet, box, **o): S.append({'name': name, 'sheet': sheet, 'box': box, **o})

# ---- city view sheet (plain background). Labels sit under each object: 'bottom' stops the crop above them.
LABEL = {'castles': 446, 'military': 690, 'walls': 920, 'economy': 1152, 'civic': 1372}
castles = {'hall-1': [108,300,88,120], 'hall-2': [276,308,84,112], 'hall-3': [424,260,248,212], 'hall-4': [708,232,276,240],
           'hall-5': [1016,228,276,244], 'hall-6': [1348,208,308,260], 'hall-7': [1720,140,372,340], 'hall-8': [2148,84,328,388]}
for n, b in castles.items(): add(n, 'city', b, pad=18, thr=55, keep=0.2)
# towers stand in a faint glow: a higher threshold leaves it out
THR = {'tower-1': 48, 'tower-2': 48, 'tower-3': 48}
rows = {
 'military': {'range': [752,540,268,168], 'stables': [1128,520,188,164],
              'workshop': [1460,512,248,168], 'academy': [2212,500,204,184]},
 'walls': {'wall': [124,780,184,136], 'wall-gate': [440,776,168,140], 'wall-corner': [740,784,180,124], 'wall-breach': [1056,784,160,128],
           'tower-1': [1400,780,88,132], 'tower-2': [1716,776,72,136], 'tower-3': [2012,768,84,144], 'bastion': [2272,796,148,120]},
 'economy': {'market': [408,1012,228,136], 'warehouse': [752,996,152,148], 'lumber': [1048,1002,188,140],
             'mine': [1344,1012,172,164], 'quarry': [1648,996,196,156], 'blacksmith': [1956,1008,200,140], 'tavern': [2280,1012,160,168]},
 'civic': {'cottage': [116,1236,196,164], 'townhouse': [452,1220,148,176], 'manor': [720,1208,212,192], 'hospital': [1080,1218,124,152],
           'fountain': [1392,1244,108,120], 'statue': [1712,1228,80,136], 'bridge': [1968,1248,172,116], 'barricade': [2268,1252,164,100]},
}
for row, items in rows.items():
    for n, b in items.items():
        add(n, 'city', b, pad=0 if n == 'hospital' else 14, bottom=LABEL[row], thr=THR.get(n, 34), **({'top': 1227, 'erase': [[1060, 1180, 75, 47], [1160, 1180, 70, 47]]} if n == 'hospital' else {}))

# ---- world map sheet: camps and ruins are drawn on blocks of earth; keep the top surface and what stands on it
for n, b in {'camp-1': [112,996,224,188], 'camp-2': [408,1008,240,176], 'camp-3': [1636,976,224,204], 'ruin': [1636,1212,224,188],
             'ruin-keep': [1036,1012,196,168]}.items():
    add(n, 'map', b, pad=12, thr=34, ground='top')

# ---- interface sheet: resource icons, banners, accents
for n, b in {'icon-food': [96,1260,92,92], 'icon-wood': [200,1260,92,92], 'icon-stone': [308,1268,80,76], 'icon-iron': [420,1272,80,68],
             'icon-gold': [516,1260,88,92], 'banner-victory': [1628,940,152,220], 'banner-defeat': [1784,968,192,160],
             'levelup': [2188,972,300,176], 'chest-1': [1960,1252,120,116], 'chest-2': [2120,1240,140,132],
             'chest-3': [2284,1236,156,132], 'scroll': [1024,1260,88,92], 'trophy': [1156,1264,96,88]}.items():
    add(n, 'ui', b, pad=10)

# ---- production kit: battle effects
for n, b in {'fx-fireball': [1416,800,100,64], 'fx-slash': [2104,792,128,104], 'fx-rock': [2376,792,88,100], 'fx-burst': [2364,920,108,92]}.items():
    add(n, 'kit', b, pad=10)

# ---- legendary sheet (busy background): landmarks, farm and barracks stages, resource fields
for n, b in {'capital': [756,744,340,320], 'pass': [1126,780,218,270], 'sanctum': [1424,740,224,320], 'altar': [1644,850,180,210],
             'shrine': [1836,836,124,208], 'ruin-legend': [1996,806,228,244], 'farm-1': [1280,550,216,140], 'farm-2': [1508,470,276,222],
             'farm-3': [1796,440,324,252], 'farm-4': [2116,466,416,264], 'barracks-1': [1280,272,190,128], 'barracks-2': [1530,160,236,240],
             'barracks-3': [1836,180,288,220], 'barracks-4': [2152,120,350,280], 'city-shield': [40,772,288,260],
             'field-food': [64,1132,264,236], 'field-food-2': [308,1132,292,236], 'field-wood': [628,1132,240,236], 'field-stone': [912,1184,220,168],
             'field-iron': [1188,1164,252,204], 'field-iron-2': [1484,1172,192,180], 'field-gold': [1744,1152,252,212]}.items():
    add(n, 'legend', b, pad=6, thr=38, keep=0.12, center=True, erase=[[728, 768, 120, 58]] if n == 'capital' else [])

# ---- heroes sheet: the five commanders who have art, standing on their circles
for n, b in {'hero-kael': [760,160,270,240], 'hero-amara': [790,410,196,240], 'hero-temur': [780,650,200,240], 'hero-veyra': [750,926,210,204],
             'hero-orun': [700,1146,290,268]}.items():
    add(n, 'heroes', b, pad=4, keep=0.08)

# ---- soldiers sheet (busy background): walk, attack and fall frames, centred on each frame
units = {
  'inf': {'y': 172, 'h': 236, 'walk': [140, 300, 470, 640, 810, 980], 'attack': [1200, 1370, 1540, 1700, 1860], 'fall': [2060, 2240, 2430], 'w': 172},
  'cav': {'y': 466, 'h': 262, 'walk': [150, 320, 490, 660, 820, 990], 'attack': [1200, 1400, 1620, 1830], 'fall': [2050, 2220, 2420], 'w': 186},
  'arc': {'y': 836, 'h': 220, 'walk': [140, 300, 470, 640, 810, 980], 'attack': [1220, 1400, 1570, 1760], 'fall': [2040, 2210, 2430], 'w': 168},
  'sie': {'y': 1150, 'h': 250, 'walk': [150, 430, 710, 990], 'attack': [1280, 1440, 1760], 'fall': [2100, 2420], 'w': 250},
}
# frames whose background could not be separated cleanly (the magic circle behind them), or two frames run together
SKIP = {'inf-attack-2', 'arc-attack-1', 'arc-attack-2', 'sie-attack-1', 'sie-attack-2'}
for u, r in units.items():
    for act in ('walk', 'attack', 'fall'):
        for k, cx in enumerate(r[act]):
            w = r['w'] + (70 if act == 'attack' and u in ('cav', 'arc') else 0) + (50 if act == 'fall' else 0)
            name = f'{u}-{act}-{k + 1}'
            if name in SKIP:
                continue
            add(name, 'soldiers', [cx - w // 2, r['y'], w, r['h']], pad=0, thr=34, keep=0.15, open=1, adaptive=True, center=True, scale=0.62)

# ---- commanders sheet (1206 x 663): 15 historical commanders, a full figure and a framed portrait in each cell
IDS = [['suntzu', 'genghis', 'nobunaga', 'musashi', 'caocao'], ['alexander', 'caesar', 'leonidas', 'cleopatra', 'hannibal'],
       ['joan', 'richard', 'saladin', 'ragnar', 'boudica']]
CELL_X = [40, 272, 505, 738, 966]
FRAME_ROW = [108, 290, 487]   # the thin frame line along the top of each row of cells
FRAME_X = [188, 424, 652, 884, 1104]
ROW_TOP = [104, 288, 486]
FRAME_Y = [176, 364, 568]
LABEL_TOP = [238, 431, 629]
for r, row in enumerate(IDS):
    for c, cid in enumerate(row):
        fx, fy = FRAME_X[c], FRAME_Y[r]
        # the portrait: the picture inside its gold frame
        add('face-' + cid, 'cmd', [fx + 5, fy + 5, 50, 54], pad=0, crop=True, scale=1.6)
        # the full figure: the cell without its portrait and its name
        top = ROW_TOP[r] - (24 if cid == 'joan' else 0)   # Joan's banner rises above her cell
        add('hero-' + cid, 'cmd', [CELL_X[c] + 3, top, 200, LABEL_TOP[r] - top], pad=0, thr=22, keep=0.1, center=True,
            clear=[[fx - 3, fy - 3, 68, 72]], open=0, inpaint_rows=[[FRAME_ROW[r] - 1, FRAME_ROW[r] + 2]], glow=[120, 98, 52], glowres=11)

man = {'sheets': {'city': 'city.jpg', 'map': 'world-map.jpg', 'ui': 'interface.jpg', 'kit': 'production-kit.jpg', 'legend': 'legendary-buildings.jpg',
                  'heroes': 'heroes.jpg', 'soldiers': 'soldiers.jpg', 'civ': 'civilizations.jpg', 'cmd': 'commanders.jpg'}, 'sprites': S}
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
json.dump(man, open(os.path.join(root, 'art', 'sprites.json'), 'w'), indent=1)
print(len(S), 'sprites')
