"""Generate SVG diagrams for the SUBSAMPLE documentation page.

Uses @media (prefers-color-scheme) for light/dark theme support since SVGs
loaded via <img> tags don't inherit CSS from the parent document.
ViewBox width is ~600 to match typical content width so 1 unit ~ 1px.
"""

import os

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "static", "images", "docs", "subsample")

# QuestDB palette
PINK = "#e289a4"       # algorithm lines
CYAN = "#0cc0df"       # titles, M4/MinMax min/max role dots
GRAY = "#888"          # default dots (real rows from raw data)

# Segment A: 24 points, i=0..23 (represents 24 hourly bars)
SEG_A = [
    0.50, 0.55, 0.60, 0.65, 0.70, 0.95, 0.85, 0.70, 0.60, 0.55,
    0.50, 0.45, 0.40, 0.35, 0.28, 0.20, 0.25, 0.30, 0.35, 0.40,
    0.45, 0.50, 0.48, 0.46,
]

# Gap dataset: 3 data segments, 1 small gap (3h), 1 big gap (24h)
# Seg A: i=0..10, Seg B: i=14..23 (small gap 11-13), Seg C: i=48..68 (big gap 24-47)
GAP_SEG_A_I = list(range(0, 11))
GAP_SEG_A_V = [0.50, 0.55, 0.60, 0.65, 0.70, 0.95, 0.85, 0.70, 0.60, 0.55, 0.50]

GAP_SEG_B_I = list(range(14, 24))
GAP_SEG_B_V = [0.42, 0.38, 0.35, 0.28, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45]

GAP_SEG_C_I = list(range(48, 69))
GAP_SEG_C_V = [
    0.45, 0.50, 0.55, 0.58, 0.60, 0.65, 0.70, 0.75, 0.70, 0.55,
    0.40, 0.25, 0.15, 0.25, 0.40, 0.55, 0.60, 0.62, 0.60, 0.58, 0.55,
]

# Single panel layout (viewBox units - keep at 600 for good proportions)
W = 600
H = 300
XL, XR = 10, 590  # plot x range - use full width
YT, YB = 60, 240  # plot y range (180px tall)
LY = 275           # legend baseline

# Gap SVG layout (three panels: raw, no-gap LTTB, gap LTTB)
GH = 600
G0T, G0B = 50, 140    # panel 0: raw data with gap
G1T, G1B = 200, 310   # panel 1: LTTB without gap detection
G2T, G2B = 370, 480   # panel 2: LTTB with gap detection
GLY = 520              # legend

# Intrinsic pixel width - set larger than container so max-width:100% fills it
PX_W = 1400

# Sizes (viewBox units - rendered ~1.3x on screen)
TITLE_SZ = 12
LEG_SZ = 11
REF_SW = 1.0
ALGO_SW = 2.0
DOT_R = 4.5
LEG_DOT = 3.5
BK_SW = 0.8

STYLE = f"""<style>
  .t {{ font-size: {TITLE_SZ}px; font-weight: 600; }}
  .l {{ font-size: {LEG_SZ}px; }}
  .ref {{ stroke-width: {REF_SW}; stroke-dasharray: 6 5; fill: none; }}
  .bk {{ stroke-width: {BK_SW}; stroke-dasharray: 2 3; }}
  .t {{ fill: {CYAN}; }}
  .l {{ fill: #64748b; }}
  .ref {{ stroke: #bbb; }}
  .bk {{ stroke: #5a9aa8; }}
  .sep {{ stroke: #ccc; }}
  @media (prefers-color-scheme: dark) {{
    .t {{ fill: {CYAN}; }}
    .l {{ fill: #b1b5d3; }}
    .ref {{ stroke: #555; }}
    .bk {{ stroke: #2a7a8a; }}
    .sep {{ stroke: #3a3a3a; }}
  }}
</style>"""


def xp(i, imin, imax):
    if imax == imin:
        return (XL + XR) / 2
    return XL + (i - imin) / (imax - imin) * (XR - XL)


def yp(v, yt, yb):
    return yt + (1 - v) * (yb - yt)


def pl(ii, vv, imin, imax, yt, yb):
    return " ".join(f"{xp(i,imin,imax):.1f},{yp(v,yt,yb):.1f}" for i, v in zip(ii, vv))


def cd(ii, vv, imin, imax, yt, yb, fill):
    return "\n".join(
        f'<circle cx="{xp(i,imin,imax):.1f}" cy="{yp(v,yt,yb):.1f}" r="{DOT_R}" fill="{fill}"/>'
        for i, v in zip(ii, vv))


def cdm(pcs, imin, imax, yt, yb):
    return "\n".join(
        f'<circle cx="{xp(i,imin,imax):.1f}" cy="{yp(v,yt,yb):.1f}" r="{DOT_R}" fill="{c}"/>'
        for i, v, c in pcs)


def rpl(ii, vv, imin, imax, yt, yb):
    return f'<polyline class="ref" points="{pl(ii,vv,imin,imax,yt,yb)}"/>'


def bkl(bounds, imin, imax, yt, yb):
    return "\n".join(
        f'<line class="bk" x1="{xp(b,imin,imax):.1f}" y1="{yt}" '
        f'x2="{xp(b,imin,imax):.1f}" y2="{yb}"/>'
        for b in bounds)


def hdr(w, h, title, desc):
    px_h = int(h * PX_W / w)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{PX_W}" height="{px_h}" '
            f'font-family="-apple-system, BlinkMacSystemFont, \'Segoe UI\', '
            f'Helvetica, Arial, sans-serif" role="img">\n'
            f'<title>{title}</title>\n<desc>{desc}</desc>\n{STYLE}')


def gen_raw():
    """Raw data panel - 24 hourly bars."""
    N = len(SEG_A)
    im, ix = 0, N - 1
    ri = list(range(N))
    h = 260
    yt, yb = 55, 200
    ly = 240
    raw_color = "#888"
    raw_dots = "\n".join(
        f'<circle cx="{xp(i,im,ix):.1f}" cy="{yp(v,yt,yb):.1f}" r="3.5" fill="{raw_color}"/>'
        for i, v in zip(ri, SEG_A)
    )

    return f"""{hdr(W, h, "Raw time series", "24 hourly data points with a spike and a trough.")}
<text class="t" x="{XL}" y="35">Raw time series: 24 hourly bars</text>
<polyline points="{pl(ri, SEG_A, im, ix, yt, yb)}" fill="none" stroke="{raw_color}" stroke-width="1.5"/>
{raw_dots}
<circle cx="{XL+10}" cy="{ly}" r="3.5" fill="{raw_color}"/>
<text class="l" x="{XL+22}" y="{ly+5}">Hourly bars (24)</text>
</svg>"""


def gen_lttb():
    N = len(SEG_A)
    im, ix = 0, N - 1
    ri = list(range(N))
    # LTTB target 8: first + last always kept, 6 interior buckets
    si = [0, 4, 5, 8, 15, 19, 22, 23]
    sv = [SEG_A[i] for i in si]
    return f"""{hdr(W, H, "LTTB downsampling", "LTTB selects 8 points from 24.")}
<text class="t" x="{XL}" y="35">LTTB: 24 hourly bars reduced to 8</text>
{rpl(ri, SEG_A, im, ix, YT, YB)}
<polyline points="{pl(si,sv,im,ix,YT,YB)}" fill="none" stroke="{PINK}" stroke-width="{ALGO_SW}"/>
{cd(si,sv,im,ix,YT,YB,GRAY)}
<line class="ref" x1="{XL}" y1="{LY}" x2="{XL+24}" y2="{LY}"/>
<text class="l" x="{XL+30}" y="{LY+5}">Raw data</text>
<circle cx="{XL+130}" cy="{LY}" r="{LEG_DOT}" fill="{GRAY}"/>
<text class="l" x="{XL+142}" y="{LY+5}">Selected points (8 of 24)</text>
</svg>"""


def gen_m4():
    N = len(SEG_A)
    im, ix = 0, N - 1
    ri = list(range(N))
    # M4 target 8 -> 2 time buckets (0..11, 12..23)
    # Bucket 1: first=0(.50), last=11(.45), min=0(.50)->dup, max=5(.95) -> 3 pts
    # Bucket 2: first=12(.40), last=23(.46), min=15(.20), max=21(.50) -> 4 pts
    m4 = [
        (0,.50,GRAY),(5,.95,CYAN),(11,.45,GRAY),
        (12,.40,GRAY),(15,.20,CYAN),(21,.50,CYAN),(23,.46,GRAY),
    ]
    mi = [p[0] for p in m4]
    mv = [p[1] for p in m4]
    return f"""{hdr(W, H, "M4 downsampling", "M4 selects 7 points from 24.")}
<text class="t" x="{XL}" y="35">M4: target 8, emitted 7 (2 time buckets)</text>
{bkl([12], im, ix, YT, YB)}
{rpl(ri, SEG_A, im, ix, YT, YB)}
<polyline points="{pl(mi,mv,im,ix,YT,YB)}" fill="none" stroke="{PINK}" stroke-width="{ALGO_SW}"/>
{cdm(m4, im, ix, YT, YB)}
<line class="ref" x1="{XL}" y1="{LY}" x2="{XL+24}" y2="{LY}"/>
<text class="l" x="{XL+30}" y="{LY+5}">Raw data</text>
<circle cx="{XL+130}" cy="{LY}" r="{LEG_DOT}" fill="{GRAY}"/>
<text class="l" x="{XL+142}" y="{LY+5}">First / Last</text>
<circle cx="{XL+240}" cy="{LY}" r="{LEG_DOT}" fill="{CYAN}"/>
<text class="l" x="{XL+252}" y="{LY+5}">Min / Max</text>
<line class="bk" x1="{XL+340}" y1="{LY}" x2="{XL+364}" y2="{LY}"/>
<text class="l" x="{XL+370}" y="{LY+5}">Bucket boundary</text>
</svg>"""


def gen_minmax():
    N = len(SEG_A)
    im, ix = 0, N - 1
    ri = list(range(N))
    # MinMax target 8 -> 4 time buckets of 6 (0..5, 6..11, 12..17, 18..23)
    # Bucket 1: min=0(.50), max=5(.95)
    # Bucket 2: min=11(.45), max=6(.85)
    # Bucket 3: min=15(.20), max=12(.40)
    # Bucket 4: min=23(.46), max=21(.50)
    mi = [0, 5, 6, 11, 12, 15, 21, 23]
    mv = [.50, .95, .85, .45, .40, .20, .50, .46]
    return f"""{hdr(W, H, "MinMax downsampling", "MinMax selects 8 points from 24.")}
<text class="t" x="{XL}" y="35">MinMax: target 8, emitted 8 (4 time buckets)</text>
{bkl([6, 12, 18], im, ix, YT, YB)}
{rpl(ri, SEG_A, im, ix, YT, YB)}
<polyline points="{pl(mi,mv,im,ix,YT,YB)}" fill="none" stroke="{PINK}" stroke-width="{ALGO_SW}"/>
{cd(mi,mv,im,ix,YT,YB,GRAY)}
<line class="ref" x1="{XL}" y1="{LY}" x2="{XL+24}" y2="{LY}"/>
<text class="l" x="{XL+30}" y="{LY+5}">Raw data</text>
<circle cx="{XL+130}" cy="{LY}" r="{LEG_DOT}" fill="{GRAY}"/>
<text class="l" x="{XL+142}" y="{LY+5}">Selected points (8 of 24)</text>
<line class="bk" x1="{XL+350}" y1="{LY}" x2="{XL+374}" y2="{LY}"/>
<text class="l" x="{XL+380}" y="{LY+5}">Bucket boundary</text>
</svg>"""


def _gap_helpers():
    """Shared helpers for the three gap SVGs."""
    im, ix = 0, 68
    raw_color = "#888"
    small_gap_mid = 12
    big_gap_mid = 35.5

    def raw_pls(yt, yb):
        return (f"{rpl(GAP_SEG_A_I, GAP_SEG_A_V, im, ix, yt, yb)}\n"
                f"{rpl(GAP_SEG_B_I, GAP_SEG_B_V, im, ix, yt, yb)}\n"
                f"{rpl(GAP_SEG_C_I, GAP_SEG_C_V, im, ix, yt, yb)}")

    def raw_dots_str(yt, yb):
        parts = []
        for si, sv in [(GAP_SEG_A_I, GAP_SEG_A_V),
                       (GAP_SEG_B_I, GAP_SEG_B_V),
                       (GAP_SEG_C_I, GAP_SEG_C_V)]:
            parts.extend(
                f'<circle cx="{xp(i,im,ix):.1f}" cy="{yp(v,yt,yb):.1f}" '
                f'r="3.5" fill="{raw_color}"/>'
                for i, v in zip(si, sv))
        return "\n".join(parts)

    def raw_lines_str(yt, yb):
        return (
            f'<polyline points="{pl(GAP_SEG_A_I, GAP_SEG_A_V, im, ix, yt, yb)}" '
            f'fill="none" stroke="{raw_color}" stroke-width="1.5"/>\n'
            f'<polyline points="{pl(GAP_SEG_B_I, GAP_SEG_B_V, im, ix, yt, yb)}" '
            f'fill="none" stroke="{raw_color}" stroke-width="1.5"/>\n'
            f'<polyline points="{pl(GAP_SEG_C_I, GAP_SEG_C_V, im, ix, yt, yb)}" '
            f'fill="none" stroke="{raw_color}" stroke-width="1.5"/>')

    return im, ix, raw_color, small_gap_mid, big_gap_mid, raw_pls, raw_dots_str, raw_lines_str


def gen_gap_raw():
    """Raw data with gaps - shows where the gaps are."""
    im, ix, raw_color, sg, bg, _, raw_dots_str, raw_lines_str = _gap_helpers()
    total = len(GAP_SEG_A_V) + len(GAP_SEG_B_V) + len(GAP_SEG_C_V)
    return f"""{hdr(W, H, "Raw data with gaps", "42 points with a small and large gap.")}
<text class="t" x="{XL}" y="35">Raw data: {total} points, small gap (3h) and large gap (24h)</text>
{bkl([sg, bg], im, ix, YT, YB)}
{raw_lines_str(YT, YB)}
{raw_dots_str(YT, YB)}
<circle cx="{XL+10}" cy="{LY}" r="3.5" fill="{raw_color}"/>
<text class="l" x="{XL+22}" y="{LY+5}">Data points ({total})</text>
<line class="bk" x1="{XL+160}" y1="{LY}" x2="{XL+184}" y2="{LY}"/>
<text class="l" x="{XL+190}" y="{LY+5}">Gap boundary</text>
</svg>"""


def gen_gap_no_detect():
    """LTTB without gap detection - connects across all gaps."""
    im, ix, _, sg, bg, raw_pls, _, _ = _gap_helpers()
    ng_i = [0, 4, 5, 10, 18, 23, 51, 55, 60, 64, 67, 68]
    ng_v = [.50, .70, .95, .50, .20, .45, .55, .75, .15, .55, .60, .55]
    return f"""{hdr(W, H, "LTTB without gap detection", "LTTB connects across all gaps.")}
<text class="t" x="{XL}" y="35">LTTB without gap detection: connects across all gaps</text>
{raw_pls(YT, YB)}
<polyline points="{pl(ng_i,ng_v,im,ix,YT,YB)}" fill="none" stroke="{PINK}" stroke-width="{ALGO_SW}"/>
{cd(ng_i,ng_v,im,ix,YT,YB,GRAY)}
<line class="ref" x1="{XL}" y1="{LY}" x2="{XL+24}" y2="{LY}"/>
<text class="l" x="{XL+30}" y="{LY+5}">Raw data</text>
<circle cx="{XL+130}" cy="{LY}" r="{LEG_DOT}" fill="{GRAY}"/>
<text class="l" x="{XL+142}" y="{LY+5}">Selected points (12 of {len(GAP_SEG_A_V)+len(GAP_SEG_B_V)+len(GAP_SEG_C_V)})</text>
</svg>"""


def gen_gap_detect():
    """LTTB with gap detection - small gap connected, large gap preserved."""
    im, ix, _, sg, bg, raw_pls, _, _ = _gap_helpers()
    g_ab_i = [0, 5, 10, 18, 22, 23]
    g_ab_v = [.50, .95, .50, .20, .40, .45]
    g_c_i = [48, 55, 58, 60, 65, 68]
    g_c_v = [.45, .75, .55, .15, .60, .55]
    return f"""{hdr(W, H, "LTTB with gap detection", "Small gap connected, large gap preserved.")}
<text class="t" x="{XL}" y="35">LTTB with gap threshold '6h': small gap connected, large gap preserved</text>
{bkl([bg], im, ix, YT, YB)}
{raw_pls(YT, YB)}
<polyline points="{pl(g_ab_i,g_ab_v,im,ix,YT,YB)}" fill="none" stroke="{PINK}" stroke-width="{ALGO_SW}"/>
<polyline points="{pl(g_c_i,g_c_v,im,ix,YT,YB)}" fill="none" stroke="{PINK}" stroke-width="{ALGO_SW}"/>
{cd(g_ab_i,g_ab_v,im,ix,YT,YB,GRAY)}
{cd(g_c_i,g_c_v,im,ix,YT,YB,GRAY)}
<line class="ref" x1="{XL}" y1="{LY}" x2="{XL+24}" y2="{LY}"/>
<text class="l" x="{XL+30}" y="{LY+5}">Raw data</text>
<circle cx="{XL+130}" cy="{LY}" r="{LEG_DOT}" fill="{GRAY}"/>
<text class="l" x="{XL+142}" y="{LY+5}">Selected points (12)</text>
<line class="bk" x1="{XL+310}" y1="{LY}" x2="{XL+334}" y2="{LY}"/>
<text class="l" x="{XL+340}" y="{LY+5}">Gap boundary</text>
</svg>"""


if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)
    for name, fn in [("raw.svg", gen_raw), ("lttb.svg", gen_lttb), ("m4.svg", gen_m4),
                     ("minmax.svg", gen_minmax),
                     ("gap-raw.svg", gen_gap_raw),
                     ("gap-no-detect.svg", gen_gap_no_detect),
                     ("gap-detect.svg", gen_gap_detect)]:
        path = os.path.join(OUT_DIR, name)
        with open(path, "w") as f:
            f.write(fn())
        print(f"Wrote {path}")
