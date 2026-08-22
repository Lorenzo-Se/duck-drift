#!/usr/bin/env python3
"""Generate track texture and collision-mask PNGs from an SVG centerline.

Setup (macOS):
  brew install cairo
  python3 -m venv .venv && source .venv/bin/activate
  pip install -r tools/requirements.txt

Run (use the shell wrapper on macOS so Cairo is found):
  ./tools/generate_track_pngs.sh public/host/assets/tracks/silverstone.svg
"""

from __future__ import annotations

import argparse
import io
import re
import sys
from pathlib import Path
from xml.etree import ElementTree as ET

import cairosvg
from PIL import Image, ImageFilter

SVG_NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG_NS)

DRAWABLE_TAGS = frozenset(
    {
        "path",
        "line",
        "polyline",
        "polygon",
        "rect",
        "circle",
        "ellipse",
    }
)


def parse_hex_color(value: str) -> tuple[int, int, int]:
    match = re.fullmatch(r"#([0-9a-fA-F]{6})", value.strip())
    if not match:
        raise argparse.ArgumentTypeError(f"Expected #rrggbb color, got: {value}")
    hex_value = match.group(1)
    return (
        int(hex_value[0:2], 16),
        int(hex_value[2:4], 16),
        int(hex_value[4:6], 16),
    )


def parse_view_box(svg_root: ET.Element) -> tuple[float, float, float, float]:
    view_box = svg_root.get("viewBox")
    if view_box:
        parts = [float(part) for part in re.split(r"[\s,]+", view_box.strip())]
        if len(parts) == 4:
            return parts[0], parts[1], parts[2], parts[3]

    width = float(svg_root.get("width", "1000").replace("px", ""))
    height = float(svg_root.get("height", "1000").replace("px", ""))
    return 0.0, 0.0, width, height


def ensure_black_background(svg_root: ET.Element, view_box: tuple[float, float, float, float]) -> None:
    x, y, width, height = view_box
    background = ET.Element(
        f"{{{SVG_NS}}}rect",
        {
            "id": "track-background",
            "x": str(x),
            "y": str(y),
            "width": str(width),
            "height": str(height),
            "fill": "#000000",
        },
    )
    svg_root.insert(0, background)


def prepare_svg_for_render(
    svg_path: Path,
    track_width_svg: float,
) -> bytes:
    tree = ET.parse(svg_path)
    svg_root = tree.getroot()
    view_box = parse_view_box(svg_root)
    ensure_black_background(svg_root, view_box)
    svg_root.set("shape-rendering", "crispEdges")

    for element in svg_root.iter():
        tag = element.tag.rsplit("}", 1)[-1]
        if tag not in DRAWABLE_TAGS:
            continue
        if element.get("id") == "track-background":
            continue

        element.set("stroke", "#ffffff")
        element.set("stroke-width", str(track_width_svg))
        element.set("fill", "none")
        element.set("stroke-linecap", "butt")
        element.set("stroke-linejoin", "miter")
        element.set("shape-rendering", "crispEdges")

    return ET.tostring(svg_root, encoding="utf-8", xml_declaration=True)


def compute_output_size(
    view_box: tuple[float, float, float, float],
    width: int | None,
    height: int | None,
) -> tuple[int, int]:
    _, _, vb_width, vb_height = view_box
    aspect_ratio = vb_width / vb_height

    if width is None and height is None:
        width = 2048
        height = max(1, round(width / aspect_ratio))
    elif width is None:
        width = max(1, round(height * aspect_ratio))
    elif height is None:
        height = max(1, round(width / aspect_ratio))

    return width, height


def render_svg(svg_bytes: bytes, width: int, height: int) -> Image.Image:
    png_bytes = cairosvg.svg2png(
        bytestring=svg_bytes,
        output_width=width,
        output_height=height,
    )
    return Image.open(io.BytesIO(png_bytes)).convert("L")


def extract_mask(
    image: Image.Image,
    threshold: int,
    dilate: int,
    erode: int,
) -> Image.Image:
    mask = image.point(lambda pixel: 255 if pixel >= threshold else 0)

    if erode > 0:
        kernel_size = erode * 2 + 1
        mask = mask.filter(ImageFilter.MinFilter(size=kernel_size))

    if dilate > 0:
        kernel_size = dilate * 2 + 1
        mask = mask.filter(ImageFilter.MaxFilter(size=kernel_size))

    return mask.point(lambda pixel: 255 if pixel > 0 else 0)


def create_texture(mask: Image.Image, asphalt: tuple[int, int, int], grass: tuple[int, int, int]) -> Image.Image:
    texture = Image.new("RGB", mask.size, grass)
    asphalt_layer = Image.new("RGB", mask.size, asphalt)
    texture.paste(asphalt_layer, mask=mask)
    return texture


def generate_track_pngs(
    input_svg: Path,
    output_dir: Path,
    name: str,
    track_width_px: int,
    width: int | None,
    height: int | None,
    threshold: int,
    dilate: int,
    erode: int,
    asphalt: tuple[int, int, int],
    grass: tuple[int, int, int],
) -> tuple[Path, Path, int, int]:
    if not input_svg.is_file():
        raise FileNotFoundError(f"SVG not found: {input_svg}")

    tree = ET.parse(input_svg)
    view_box = parse_view_box(tree.getroot())
    output_width, output_height = compute_output_size(view_box, width, height)

    _, _, vb_width, _ = view_box
    track_width_svg = track_width_px * (vb_width / output_width)
    svg_bytes = prepare_svg_for_render(input_svg, track_width_svg)

    rendered = render_svg(svg_bytes, output_width, output_height)
    mask = extract_mask(rendered, threshold=threshold, dilate=dilate, erode=erode)
    texture = create_texture(mask, asphalt=asphalt, grass=grass)

    output_dir.mkdir(parents=True, exist_ok=True)
    mask_path = output_dir / f"{name}_mask.png"
    texture_path = output_dir / f"{name}_texture.png"

    mask.save(mask_path, format="PNG", optimize=True)
    texture.save(texture_path, format="PNG", optimize=True)

    return mask_path, texture_path, output_width, output_height


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Generate track texture and collision-mask PNGs from an SVG centerline.",
    )
    parser.add_argument("input_svg", type=Path, help="Path to source SVG with track centerline")
    parser.add_argument(
        "--track-width-px",
        type=int,
        default=48,
        help="Track width in output pixels (default: 48)",
    )
    parser.add_argument("--width", type=int, default=None, help="Output width in pixels (default: 2048)")
    parser.add_argument("--height", type=int, default=None, help="Output height in pixels")
    parser.add_argument("--threshold", type=int, default=128, help="Luminance threshold for mask (default: 128)")
    parser.add_argument("--dilate", type=int, default=0, help="Expand mask by N pixels (default: 0)")
    parser.add_argument("--erode", type=int, default=0, help="Shrink mask by N pixels to remove AA fringe (default: 0)")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("public/host/assets/tracks"),
        help="Directory for generated PNG files",
    )
    parser.add_argument(
        "--name",
        type=str,
        default=None,
        help="Base output name (default: input SVG filename without extension)",
    )
    parser.add_argument("--asphalt", type=parse_hex_color, default="#5a5a5a", help="Asphalt color #rrggbb")
    parser.add_argument("--grass", type=parse_hex_color, default="#3a7d34", help="Grass color #rrggbb")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    name = args.name or args.input_svg.stem

    try:
        mask_path, texture_path, width, height = generate_track_pngs(
            input_svg=args.input_svg,
            output_dir=args.output_dir,
            name=name,
            track_width_px=args.track_width_px,
            width=args.width,
            height=args.height,
            threshold=args.threshold,
            dilate=args.dilate,
            erode=args.erode,
            asphalt=args.asphalt,
            grass=args.grass,
        )
    except (FileNotFoundError, ET.ParseError, ValueError) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1

    print(f"Generated {width}x{height} PNGs:")
    print(f"  mask:    {mask_path}")
    print(f"  texture: {texture_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
