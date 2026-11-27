"""Icônes Android de Cockpit (à relancer si l'icône du PC change : python scripts/android_icons.py), tirées de celle du PC (src-tauri/icons/icon.png) : fond sombre, anneau, point bleu.

Mesures prises sur l'icône du PC (512 px) : carré de 448 px, anneau de rayon 116 (extérieur) et 74
(intérieur), point de rayon 23. Icône adaptative : le carré du PC devient la partie visible (72 dp sur 108).
"""
import os
from PIL import Image, ImageDraw

RES = 'src-tauri/gen/android/app/src/main/res'
BG = (28, 28, 31, 255)
RING = (250, 250, 249, 255)
DOT = (124, 156, 255, 255)
DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
SS = 4  # suréchantillonnage


def rings(draw, cx, cy, scale):
    """Anneau et point, `scale` = pixels par pixel de l'icône du PC."""
    for radius, color in ((116, RING), (74, BG), (23, DOT)):
        r = radius * scale
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=color)


def foreground(size_px):
    """Premier plan adaptatif : 108 dp, l'anneau à l'échelle du carré visible de 72 dp."""
    big = size_px * SS
    im = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    scale = (big * 72 / 108) / 448
    draw = ImageDraw.Draw(im)
    # Le trou de l'anneau doit laisser voir le fond : on le dessine de la couleur du fond.
    rings(draw, big / 2, big / 2, scale)
    return im.resize((size_px, size_px), Image.LANCZOS)


def legacy(size_px, round_):
    """Icône d'avant Android 8 : carré arrondi (ou rond) avec l'anneau."""
    big = size_px * SS
    im = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)
    margin = big * 0.04
    if round_:
        draw.ellipse((margin, margin, big - margin, big - margin), fill=BG)
    else:
        draw.rounded_rectangle((margin, margin, big - margin, big - margin), radius=big * 0.22, fill=BG)
    scale = (big - 2 * margin) / 448
    rings(draw, big / 2, big / 2, scale)
    return im.resize((size_px, size_px), Image.LANCZOS)


for name, density in DENSITIES.items():
    folder = os.path.join(RES, f'mipmap-{name}')
    foreground(round(108 * density)).save(os.path.join(folder, 'ic_launcher_foreground.png'))
    legacy(round(48 * density), False).save(os.path.join(folder, 'ic_launcher.png'))
    legacy(round(48 * density), True).save(os.path.join(folder, 'ic_launcher_round.png'))

anydpi = os.path.join(RES, 'mipmap-anydpi-v26')
os.makedirs(anydpi, exist_ok=True)
xml = '''<?xml version="1.0" encoding="utf-8"?>
<!-- Icône de Cockpit, la même que sur le PC : fond sombre, anneau blanc, point bleu. -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/cockpit_icon_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
'''
for file in ('ic_launcher.xml', 'ic_launcher_round.xml'):
    with open(os.path.join(anydpi, file), 'w', encoding='utf-8', newline='\n') as f:
        f.write(xml)

colors = os.path.join(RES, 'values', 'colors.xml')
text = open(colors, encoding='utf-8').read()
if 'cockpit_icon_background' not in text:
    text = text.replace('</resources>', '    <color name="cockpit_icon_background">#FF1C1C1F</color>\n</resources>')
    open(colors, 'w', encoding='utf-8', newline='\n').write(text)

# Aperçu pour vérifier (facultatif) : PREVIEW=chemin.png, le premier plan sur le fond, découpé comme un lanceur.
if os.environ.get('PREVIEW'):
    prev = Image.new('RGBA', (432, 432), BG)
    prev.alpha_composite(foreground(432))
    mask = Image.new('L', (432, 432), 0)
    ImageDraw.Draw(mask).rounded_rectangle((72, 72, 360, 360), radius=90, fill=255)
    out = Image.new('RGBA', (432, 432), (240, 240, 240, 255))
    out.paste(prev, (0, 0), mask)
    out.crop((60, 60, 372, 372)).save(os.environ['PREVIEW'])
print('ok')
