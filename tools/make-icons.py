#!/usr/bin/env python3
"""Generate the PWA icons.

Pure standard library (no Pillow): the app mark is drawn straight into an RGBA
pixel buffer and written with a small PNG encoder. Run from the repository root:

    python3 tools/make-icons.py

Writes icons/icon-192.png, icons/icon-512.png, icons/icon-maskable-{192,512}.png
and icons/favicon.png. The mark is a navy rounded square holding two white
"paper" panels with a saffron underline — deliberately simple and readable at
16 px.
"""

from __future__ import annotations

import os
import struct
import zlib

NAVY = (31, 42, 68, 255)
NAVY_LIGHT = (58, 76, 122, 255)
WHITE = (250, 250, 252, 255)
PAPER = (232, 236, 245, 255)
SAFFRON = (224, 138, 34, 255)
GREEN = (32, 130, 100, 255)
INK = (24, 32, 54, 255)

ICON_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons")


def blank(size: int) -> list[list[tuple[int, int, int, int]]]:
    return [[(0, 0, 0, 0) for _ in range(size)] for _ in range(size)]


def rounded_rect(buf, size, x0, y0, x1, y1, radius, colour):
    x0, y0, x1, y1 = max(0, x0), max(0, y0), min(size, x1), min(size, y1)
    radius = max(0, min(radius, min(x1 - x0, y1 - y0) // 2))
    for y in range(y0, y1):
        for x in range(x0, x1):
            dx = 0
            dy = 0
            if x < x0 + radius:
                dx = x0 + radius - x
            elif x >= x1 - radius:
                dx = x - (x1 - radius - 1)
            if y < y0 + radius:
                dy = y0 + radius - y
            elif y >= y1 - radius:
                dy = y - (y1 - radius - 1)
            if dx and dy:
                # antialias the corner by sampling distance to the arc centre
                dist = (dx * dx + dy * dy) ** 0.5
                if dist > radius + 0.5:
                    continue
                if dist > radius - 0.5:
                    coverage = max(0.0, (radius + 0.5 - dist))
                    base = buf[y][x]
                    buf[y][x] = blend(base, colour, coverage)
                    continue
            buf[y][x] = colour


def blend(base, colour, alpha_scale):
    a = (colour[3] / 255.0) * alpha_scale
    if a <= 0:
        return base
    out = []
    for i in range(3):
        out.append(int(round(colour[i] * a + base[i] * (1 - a))))
    out_a = int(round(colour[3] * alpha_scale + base[3] * (1 - alpha_scale)))
    return (out[0], out[1], out[2], out_a)


def gradient_background(buf, size, top=NAVY, bottom=NAVY_LIGHT):
    for y in range(size):
        t = y / max(1, size - 1)
        colour = tuple(int(round(top[i] * (1 - t) + bottom[i] * t)) for i in range(3)) + (255,)
        for x in range(size):
            buf[y][x] = colour


def draw_mark(buf, size, *, maskable=False):
    """Draw the MyMPPSC mark inside the given canvas."""
    # Background: full bleed for maskable icons, rounded for the normal ones.
    if maskable:
        gradient_background(buf, size)
    else:
        rounded_rect(buf, size, 0, 0, size, size, int(size * 0.22), NAVY)

    unit = size / 512.0
    # Two stacked pages (a paper stack) with a small offset shadow.
    page_w = int(300 * unit)
    page_h = int(210 * unit)
    left = (size - page_w) // 2 + int(6 * unit)
    top = int(120 * unit)
    rounded_rect(buf, size, left + int(14 * unit), top + int(16 * unit), left + page_w + int(14 * unit), top + page_h + int(16 * unit), int(26 * unit), (12, 18, 34, 120))
    rounded_rect(buf, size, left, top, left + page_w, top + page_h, int(26 * unit), PAPER)

    # Text lines on the top page.
    line_colour = (150, 162, 186, 255)
    for i in range(3):
        y = top + int((52 + i * 46) * unit)
        width = page_w - int((90 + (i * 40)) * unit)
        rounded_rect(buf, size, left + int(38 * unit), y, left + width, y + int(18 * unit), int(9 * unit), line_colour)

    # Saffron "answer" rule under the lines.
    rounded_rect(buf, size, left + int(38 * unit), top + page_h - int(46 * unit), left + int(38 * unit) + int(150 * unit), top + page_h - int(26 * unit), int(10 * unit), SAFFRON)

    # A green tick chip, the "answered correctly" motif.
    cx, cy, r = left + page_w - int(58 * unit), top + page_h - int(56 * unit), int(46 * unit)
    rounded_rect(buf, size, cx - r, cy - r, cx + r, cy + r, r, GREEN)
    # tick strokes
    thick = max(1, int(11 * unit))
    for step in range(30):
        t = step / 29.0
        x = int(round((cx - r * 0.45) + t * (r * 0.45)))
        y = int(round((cy + r * 0.05) + t * (r * 0.35)))
        rounded_rect(buf, size, x, y - 0, x + thick, y + thick, thick // 2, WHITE)
    for step in range(30):
        t = step / 29.0
        x = int(round((cx + r * 0.0) + t * (r * 0.55)))
        y = int(round((cy + r * 0.4) - t * (r * 0.75)))
        rounded_rect(buf, size, x, y, x + thick, y + thick, thick // 2, WHITE)

    # A short baseline rule beneath the stack, echoing a ruled notebook.
    bar_y = top + page_h + int(64 * unit)
    bar_w = int(210 * unit)
    rounded_rect(buf, size, (size - bar_w) // 2, bar_y, (size - bar_w) // 2 + bar_w, bar_y + int(20 * unit), int(10 * unit), (255, 255, 255, 190))
    return buf


def write_png(path: str, buf) -> None:
    size = len(buf)
    raw = bytearray()
    for y in range(size):
        raw.append(0)  # filter type 0
        for x in range(size):
            raw.extend(buf[y][x])

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)

    header = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress(bytes(raw), 9)) + chunk(b'IEND', b'')
    with open(path, 'wb') as fh:
        fh.write(png)


def main() -> None:
    os.makedirs(ICON_DIR, exist_ok=True)
    targets = [
        ('icon-192.png', 192, False),
        ('icon-512.png', 512, False),
        ('icon-maskable-192.png', 192, True),
        ('icon-maskable-512.png', 512, True),
        ('favicon.png', 64, False),
    ]
    for name, size, maskable in targets:
        buf = blank(size)
        if maskable:
            # Keep the mark inside the safe zone (80% of the canvas).
            inner = blank(int(size * 0.8))
            draw_mark(inner, int(size * 0.8), maskable=True)
            offset = int(size * 0.1)
            buf = blank(size)
            for y in range(len(inner)):
                for x in range(len(inner)):
                    # the inner canvas is already full-bleed, so fill the outer area too
                    buf[y + offset][x + offset] = inner[y][x]
            # extend the gradient to the outer ring so maskable icons look unbroken
            for y in range(size):
                t = y / max(1, size - 1)
                colour = tuple(int(round(NAVY[i] * (1 - t) + NAVY_LIGHT[i] * t)) for i in range(3)) + (255,)
                for x in range(size):
                    if buf[y][x][3] == 0:
                        buf[y][x] = colour
        else:
            draw_mark(buf, size)
        write_png(os.path.join(ICON_DIR, name), buf)
        print(f'wrote icons/{name} ({size}×{size}{", maskable" if maskable else ""})')


if __name__ == '__main__':
    main()
