"""Make title-card cover images for Blue and Green World articles.

Each call writes two images into static/images/covers/:
  <slug>.jpg      1200x630, for the top of the article and for link previews (X, LinkedIn, Facebook)
  <slug>-pin.jpg  1000x1500, a tall version for Pinterest and Instagram

Usage (from the repository folder):
  python3 tools/make_cover.py --slug episode-4-whatever \
      --kicker "The 1865 Exercise, Episode 4" --title "Whatever It Is Called" \
      [--base static/images/series/1865-exercise.jpg]

Then add `cover: /images/covers/<slug>.jpg` to the article's front matter.
Needs Pillow. Uses TeX Gyre Pagella (a Palatino-style serif) when installed, otherwise DejaVu Serif.
"""

import argparse
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "static", "images", "covers")
DEFAULT_BASE = os.path.join(ROOT, "static", "images", "series", "1865-exercise.jpg")

SEA = (21, 64, 95)
PINE = (43, 102, 72)
WARM = (232, 220, 196)
WHITE = (250, 248, 242)
MUTED = (205, 200, 188)

GYRE = "/usr/share/texmf/fonts/opentype/public/tex-gyre/"
FONT_FILES = {
    "regular": [GYRE + "texgyrepagella-regular.otf", "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"],
    "italic": [GYRE + "texgyrepagella-italic.otf", "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Italic.ttf"],
    "sans": ["/usr/share/fonts/opentype/inter/Inter-Medium.otf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"],
}


def font(kind, size):
    for path in FONT_FILES[kind]:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def cover_crop(img, w, h, focus_x=0.5, focus_y=0.5):
    """Scale to fill w x h, then crop around the focus point."""
    scale = max(w / img.width, h / img.height)
    img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    left = min(max(0, round(img.width * focus_x - w / 2)), img.width - w)
    top = min(max(0, round(img.height * focus_y - h / 2)), img.height - h)
    return img.crop((left, top, left + w, top + h))


def wrap(draw, text, fnt, max_width):
    words, lines, line = text.split(), [], ""
    for word in words:
        trial = f"{line} {word}".strip()
        if draw.textlength(trial, font=fnt) <= max_width or not line:
            line = trial
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def fit_title(draw, text, max_width, max_lines, start, smallest):
    size = start
    while size > smallest:
        fnt = font("regular", size)
        lines = wrap(draw, text, fnt, max_width)
        if len(lines) <= max_lines:
            return fnt, lines, size
        size -= 4
    fnt = font("regular", smallest)
    return fnt, wrap(draw, text, fnt, max_width), smallest


def shade(size, stops, horizontal=False):
    """A black overlay whose opacity follows (position 0..1, alpha 0..255) stops."""
    w, h = size
    length = w if horizontal else h
    col = Image.new("L", (1, length) if not horizontal else (length, 1))
    px = col.load()
    for i in range(length):
        t = i / max(1, length - 1)
        for (p0, a0), (p1, a1) in zip(stops, stops[1:]):
            if p0 <= t <= p1:
                a = a0 + (a1 - a0) * ((t - p0) / max(1e-6, p1 - p0))
                break
        else:
            a = stops[-1][1]
        if horizontal:
            px[i, 0] = round(a)
        else:
            px[0, i] = round(a)
    mask = col.resize((w, h))
    black = Image.new("RGB", (w, h), (12, 14, 16))
    return black, mask


def brand_bar(img, x, y, w=150, h=6):
    bar = Image.new("RGB", (w, h))
    bp = bar.load()
    for i in range(w):
        t = i / (w - 1)
        c = tuple(round(SEA[k] + (PINE[k] - SEA[k]) * t) for k in range(3))
        for j in range(h):
            bp[i, j] = c
    img.paste(bar, (x, y))


def landscape(base, kicker, title):
    W, H = 1200, 630
    img = cover_crop(base, W, H, focus_x=0.55, focus_y=0.5)
    for stops, horiz in (([(0, 235), (0.45, 170), (0.75, 40), (1, 0)], True), ([(0, 60), (0.45, 0), (0.7, 60), (1, 200)], False)):
        black, mask = shade((W, H), stops, horiz)
        img = Image.composite(black, img, mask)
    d = ImageDraw.Draw(img)
    x, maxw = 64, 660
    fnt, lines, size = fit_title(d, title, maxw, 3, 68, 40)
    line_h = round(size * 1.12)
    kick_f = font("italic", 30)
    block_h = 44 + len(lines) * line_h
    y = max(70, round((H - 120 - block_h) / 2) + 10)
    d.text((x, y), kicker, font=kick_f, fill=WARM)
    y += 50
    for line in lines:
        d.text((x, y), line, font=fnt, fill=WHITE)
        y += line_h
    brand_bar(img, x, H - 108)
    d.text((x, H - 90), "Blue and Green World", font=font("italic", 28), fill=WHITE)
    d.text((x, H - 52), "blueandgreenworld.com", font=font("sans", 19), fill=MUTED)
    return img


def portrait(base, kicker, title):
    W, H = 1000, 1500
    img = Image.new("RGB", (W, H), (22, 20, 18))
    photo_h = 900
    top = cover_crop(base, W, photo_h, focus_x=0.52, focus_y=0.5)
    img.paste(top, (0, 0))
    black, mask = shade((W, photo_h), [(0, 30), (0.55, 30), (1, 255)])
    black = Image.new("RGB", (W, photo_h), (22, 20, 18))
    img.paste(Image.composite(black, top, mask), (0, 0))
    d = ImageDraw.Draw(img)
    x, maxw = 80, 840
    fnt, lines, size = fit_title(d, title, maxw, 4, 92, 52)
    line_h = round(size * 1.12)
    block_h = 72 + len(lines) * line_h
    # centre the text in the space between the photo's fade and the brand line
    y = max(760, round((800 + (H - 230)) / 2 - block_h / 2))
    d.text((x, y), kicker, font=font("italic", 38), fill=WARM)
    y += 72
    for line in lines:
        d.text((x, y), line, font=fnt, fill=WHITE)
        y += line_h
    brand_bar(img, x, H - 190, w=180, h=7)
    d.text((x, H - 165), "Blue and Green World", font=font("italic", 40), fill=WHITE)
    d.text((x, H - 108), "blueandgreenworld.com", font=font("sans", 26), fill=MUTED)
    return img


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--slug", required=True)
    ap.add_argument("--title", required=True)
    ap.add_argument("--kicker", default="")
    ap.add_argument("--base", default=DEFAULT_BASE)
    a = ap.parse_args()
    base = Image.open(a.base).convert("RGB")
    os.makedirs(OUT_DIR, exist_ok=True)
    landscape(base, a.kicker, a.title).save(os.path.join(OUT_DIR, f"{a.slug}.jpg"), quality=86, optimize=True, progressive=True)
    portrait(base, a.kicker, a.title).save(os.path.join(OUT_DIR, f"{a.slug}-pin.jpg"), quality=86, optimize=True, progressive=True)
    print(f"wrote static/images/covers/{a.slug}.jpg and {a.slug}-pin.jpg")


if __name__ == "__main__":
    main()
