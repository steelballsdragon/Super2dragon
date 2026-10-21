#!/usr/bin/env python3
"""Find the objects on an art sheet and draw numbered boxes around them, so each can be named in sprites.json.

    python3 -I tools/art/detect.py art/sheets/city.jpg out.png [threshold]

Prints one line per object: id, box (x, y, w, h) in sheet pixels, area. Thin frame lines and label text are
removed by a morphological opening before the objects are grouped."""
import sys
from collections import deque
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

src, out = sys.argv[1], sys.argv[2]
thr = float(sys.argv[3]) if len(sys.argv) > 3 else 30
im = Image.open(src).convert('RGB')
a = np.asarray(im).astype(np.float32)
bg = np.array([31, 31, 37], np.float32)
d = np.sqrt(((a - bg) ** 2).sum(-1))
mask = Image.fromarray(((d > thr) * 255).astype(np.uint8))
# opening removes frame lines and text strokes; closing joins the parts of one object
mask = mask.filter(ImageFilter.MinFilter(7)).filter(ImageFilter.MaxFilter(7))
mask = mask.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.MinFilter(9))
S = 4
small = np.asarray(mask.resize((mask.width // S, mask.height // S), Image.BOX)) > 96
H, W = small.shape
lab = np.zeros((H, W), np.int32)
boxes = []
for y0 in range(H):
    for x0 in range(W):
        if not small[y0, x0] or lab[y0, x0]:
            continue
        n = len(boxes) + 1
        q = deque([(y0, x0)]); lab[y0, x0] = n
        x1 = x2 = x0; y1 = y2 = y0; area = 0
        while q:
            y, x = q.popleft(); area += 1
            x1 = min(x1, x); x2 = max(x2, x); y1 = min(y1, y); y2 = max(y2, y)
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < H and 0 <= nx < W and small[ny, nx] and not lab[ny, nx]:
                    lab[ny, nx] = n; q.append((ny, nx))
        boxes.append((x1 * S, y1 * S, (x2 - x1 + 1) * S, (y2 - y1 + 1) * S, area * S * S))
boxes = [b for b in boxes if b[4] > 2500]
boxes.sort(key=lambda b: (round((b[1] + b[3] / 2) / 120), b[0]))
view = im.copy()
dr = ImageDraw.Draw(view)
for k, (x, y, w, h, area) in enumerate(boxes):
    dr.rectangle([x, y, x + w, y + h], outline=(0, 255, 120), width=3)
    dr.rectangle([x, y, x + 46, y + 30], fill=(0, 0, 0))
    dr.text((x + 4, y + 4), str(k), fill=(255, 255, 0), font_size=24)
    print(k, x, y, w, h, area)
view.resize((view.width // 2, view.height // 2)).save(out)
