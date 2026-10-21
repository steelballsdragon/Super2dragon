#!/usr/bin/env python3
"""Cut the sprites listed in art/sprites.json out of the art sheets and write them to art/sprites/ as WebP with
transparency, plus art/sprites/index.json (sizes and foot points) and a preview sheet.

    python3 -I tools/art/cut.py [name-filter]

For each sprite: crop its box from the sheet, estimate the background colour from the crop's edge, flood the
background in from the edge through pixels close to that colour, keep the object (the largest piece and any piece
at least `keep` times its size), soften the outline against the background colour, and trim."""
import json, os, sys
from collections import deque
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
MAN = json.load(open(os.path.join(ROOT, 'art', 'sprites.json')))
OUT = os.path.join(ROOT, 'art', 'sprites')
os.makedirs(OUT, exist_ok=True)
only = sys.argv[1] if len(sys.argv) > 1 else None
sheets = {}

def sheet(name):
    if name not in sheets:
        sheets[name] = np.asarray(Image.open(os.path.join(ROOT, 'art', 'sheets', MAN['sheets'][name])).convert('RGB')).astype(np.float32)
    return sheets[name]

def dilate(m, n=1):
    for _ in range(n):
        g = m.copy()
        g[1:] |= m[:-1]; g[:-1] |= m[1:]; g[:, 1:] |= m[:, :-1]; g[:, :-1] |= m[:, 1:]
        m = g
    return m

def flood(seed, allowed):
    """grow seed through allowed pixels (4-neighbour) until it stops"""
    m = seed & allowed
    while True:
        g = dilate(m) & allowed
        if (g == m).all():
            return m
        # grow several steps per comparison
        for _ in range(8):
            g = dilate(g) & allowed
        m = g

def components(m):
    H, W = m.shape
    lab = np.zeros((H, W), np.int32)
    sizes = [0]
    ys, xs = np.nonzero(m)
    for y0, x0 in zip(ys, xs):
        if lab[y0, x0]:
            continue
        n = len(sizes); lab[y0, x0] = n
        q = deque([(y0, x0)]); s = 0
        while q:
            y, x = q.popleft(); s += 1
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < H and 0 <= nx < W and m[ny, nx] and not lab[ny, nx]:
                    lab[ny, nx] = n; q.append((ny, nx))
        sizes.append(s)
    return lab, sizes

def box_blur(arr, r):
    """mean over a (2r+1)^2 window, edges clamped (via integral images)"""
    p = np.pad(arr, ((r + 1, r), (r + 1, r)) + ((0, 0),) * (arr.ndim - 2), mode='edge')
    c = p.cumsum(0).cumsum(1)
    k = 2 * r + 1
    return (c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]) / (k * k)

def adaptive_bg(a, x0, y0, x1, y1, thr, r=22, margin=60):
    """a background model for busy sheets: a blur of the surroundings that leaves out pixels that look like
    objects (normalized convolution, twice), so smooth glows and gradients count as background"""
    X0, Y0 = max(0, x0 - margin), max(0, y0 - margin)
    X1, Y1 = min(a.shape[1], x1 + margin), min(a.shape[0], y1 + margin)
    c = a[Y0:Y1, X0:X1]
    bg = np.stack([box_blur(c[..., i], r) for i in range(3)], -1)
    for _ in range(2):
        m = (np.sqrt(((c - bg) ** 2).sum(-1)) < thr).astype(np.float32)
        wsum = box_blur(m, r) + 1e-3
        bg2 = np.stack([box_blur(c[..., i] * m, r) for i in range(3)], -1) / wsum[..., None]
        bg = np.where(wsum[..., None] > 0.02, bg2, bg)
    return bg[y0 - Y0:y1 - Y0, x0 - X0:x1 - X0]

def cut(sp):
    a = sheet(sp['sheet'])
    x, y, w, h = sp['box']
    pad = sp.get('pad', 6)
    x0, y0 = max(0, x - pad), max(0, y - pad)
    x1, y1 = min(a.shape[1], x + w + pad), min(a.shape[0], y + h + pad)
    if 'bottom' in sp:
        y1 = min(y1, sp['bottom'])
    if 'top' in sp:
        y0 = max(y0, sp['top'])
    c = a[y0:y1, x0:x1].copy()
    H, W = c.shape[:2]
    thr = sp.get('thr', 30)
    # stray bits of sheet text next to an object: painted over with the sheet's background colour first
    for ex, ey, ew, eh in sp.get('erase', []):
        c[max(0, ey - y0):max(0, ey - y0 + eh), max(0, ex - x0):max(0, ex - x0 + ew)] = (31, 31, 37)
    if sp.get('adaptive'):
        bg = adaptive_bg(a, x0, y0, x1, y1, thr)
    else:
        edge = np.concatenate([c[0], c[-1], c[:, 0], c[:, -1]])
        bg = np.median(edge, axis=0) if 'bg' not in sp else np.array(sp['bg'], np.float32)
    d = np.sqrt(((c - bg) ** 2).sum(-1))
    near = d < thr
    seed = np.zeros((H, W), bool)
    seed[0] = seed[-1] = True; seed[:, 0] = seed[:, -1] = True
    bgm = flood(seed, near)
    fg = ~bgm
    # cut thin attachments (frame lines, runes, sparks) and keep the object's pieces
    o = sp.get('open', 1)
    if o:
        mi = Image.fromarray((fg * 255).astype(np.uint8))
        mi = mi.filter(ImageFilter.MinFilter(2 * o + 1)).filter(ImageFilter.MaxFilter(2 * o + 1))
        fg = (np.asarray(mi) > 127) & fg
    lab, sizes = components(fg)
    if len(sizes) <= 1:
        raise SystemExit(f"{sp['name']}: nothing found")
    keep = sp.get('keep', 0.05)
    if sp.get('center'):
        # the main piece is the big one nearest the middle of the box; neighbours' pieces off to the sides go
        idx = np.arange(1, len(sizes))
        cx = np.array([np.nonzero(lab == i)[1].mean() for i in idx])
        score = np.array(sizes[1:]) / (1 + np.abs(cx - W / 2) / (W / 6))
        main = idx[score.argmax()]
        big = sizes[main]
        keepset = [i for i in idx if sizes[i] >= big * keep and abs(cx[i - 1] - W / 2) < W * 0.38] + [main]
    else:
        big = max(sizes)
        keepset = [i for i, s in enumerate(sizes) if i and s >= big * keep]
    fg = np.isin(lab, keepset)
    # fill holes: anything not reachable from the edge through non-object pixels is object
    outside = flood(seed, ~fg)
    fg = ~outside
    if sp.get('ground') == 'top':
        # a map tile drawn as a block of earth: keep the top surface and what stands on it, drop the earth sides
        # below the surface's lower edges (and any label drawn over them)
        ys, xs = np.nonzero(fg)
        lo = ys.min() + (ys.max() - ys.min()) * 0.35
        best, by = 0, 0
        for yy in range(int(lo), ys.max() + 1):
            row = np.nonzero(fg[yy])[0]
            if len(row) and row.max() - row.min() > best:
                best, by = row.max() - row.min(), yy
        row = np.nonzero(fg[by])[0]
        L, R = row.min(), row.max()
        cxm, half = (L + R) / 2, (R - L) / 2
        Y, X = np.mgrid[0:H, 0:W]
        limit = by + (half / 2) * (1 - np.abs(X - cxm) / max(1, half)) + sp.get('lip', 3)
        fg &= Y <= limit
        outside = ~fg
    # soft outline: pixels within `soft` px of the outside take alpha from their distance to the background colour
    soft = sp.get('soft', 2)
    alpha = fg.astype(np.float32)
    if soft:
        band = dilate(outside, soft) & fg
        lo, hi = thr * 0.7, thr * 2.2
        alpha[band] = np.clip((d[band] - lo) / (hi - lo), 0, 1)
    am = Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))
    alpha = np.asarray(am).astype(np.float32) / 255
    alpha[~dilate(fg, 1)] = 0
    # un-mix the background colour out of half-transparent edge pixels
    k = np.clip(alpha, 0.05, 1)[..., None]
    rgb = np.clip((c - (1 - k) * bg) / k, 0, 255)
    rgba = np.dstack([rgb, alpha * 255]).astype(np.uint8)
    ys, xs = np.nonzero(alpha > 0.04)
    if not len(ys):
        raise SystemExit(f"{sp['name']}: empty after cutting")
    t, b, l, r = ys.min(), ys.max(), xs.min(), xs.max()
    img = Image.fromarray(rgba[max(0, t - 2):b + 3, max(0, l - 2):r + 3], 'RGBA')
    if sp.get('flip'):
        img = img.transpose(Image.FLIP_LEFT_RIGHT)
    scale = sp.get('scale', 1)
    if scale != 1:
        img = img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), Image.LANCZOS)
    path = os.path.join(OUT, sp['name'] + '.webp')
    img.save(path, 'WEBP', quality=sp.get('q', 86), method=6)
    # the foot point: the middle of the opaque pixels in the bottom tenth
    al = np.asarray(img)[..., 3]
    rows = np.nonzero(al.max(1) > 40)[0]
    bot = rows.max() if len(rows) else img.height - 1
    band_rows = al[max(0, bot - max(2, img.height // 10)):bot + 1]
    cols = np.nonzero(band_rows.max(0) > 40)[0]
    fx = float((cols.min() + cols.max()) / 2) if len(cols) else img.width / 2
    return {'w': img.width, 'h': img.height, 'fx': round(fx, 1), 'fy': int(bot), 'bytes': os.path.getsize(path)}

index_path = os.path.join(OUT, 'index.json')
index = json.load(open(index_path)) if os.path.exists(index_path) and only else {}
for sp in MAN['sprites']:
    if only and only not in sp['name']:
        continue
    index[sp['name']] = cut(sp)
    print(f"{sp['name']:28s} {index[sp['name']]['w']:4d}x{index[sp['name']]['h']:<4d} {index[sp['name']]['bytes'] // 1024:3d} KB")
names = [s['name'] for s in MAN['sprites'] if s['name'] in index]
index = {n: index[n] for n in names}
json.dump(index, open(index_path, 'w'), indent=1)
print(f"{len(index)} sprites, {sum(v['bytes'] for v in index.values()) // 1024} KB")
# preview: every sprite on a checkerboard with its name and foot point
cell = 220
cols = 10
rows = (len(names) + cols - 1) // cols
pv = Image.new('RGB', (cols * cell, rows * (cell + 20)), (60, 70, 60))
dr = ImageDraw.Draw(pv)
for i, n in enumerate(names):
    cx, cy = (i % cols) * cell, (i // cols) * (cell + 20)
    for yy in range(0, cell, 20):
        for xx in range(0, cell, 20):
            if (xx + yy) // 20 % 2:
                dr.rectangle([cx + xx, cy + yy, cx + xx + 19, cy + yy + 19], fill=(96, 110, 96))
    im = Image.open(os.path.join(OUT, n + '.webp'))
    k = min(1, (cell - 10) / max(im.width, im.height))
    im2 = im.resize((max(1, int(im.width * k)), max(1, int(im.height * k))))
    ox, oy = cx + (cell - im2.width) // 2, cy + (cell - im2.height) // 2
    pv.paste(im2, (ox, oy), im2)
    f = index[n]
    dr.ellipse([ox + f['fx'] * k - 3, oy + f['fy'] * k - 3, ox + f['fx'] * k + 3, oy + f['fy'] * k + 3], outline=(255, 0, 255), width=2)
    dr.text((cx + 3, cy + cell + 2), n, fill=(255, 255, 255), font_size=14)
pv.save(os.path.join(ROOT, 'art', 'preview.png'))
