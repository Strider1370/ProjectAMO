from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
import re

from PIL import Image


BANNER_PATTERN = re.compile(r"^[a-z0-9]{4}_banner\.png$")


@dataclass
class ConversionResult:
    source: Path
    output: Path
    original_bytes: int
    output_bytes: int
    original_size: tuple[int, int]
    output_size: tuple[int, int]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert airport banner PNG files to optimized WebP assets."
    )
    parser.add_argument(
        "--images-dir",
        type=Path,
        default=Path("frontend/public/images"),
        help="Directory containing airport banner PNG files.",
    )
    parser.add_argument(
        "--max-width",
        type=int,
        default=1600,
        help="Resize images down to this width if they are larger.",
    )
    parser.add_argument(
        "--quality",
        type=int,
        default=80,
        help="WebP quality setting (0-100).",
    )
    parser.add_argument(
        "--method",
        type=int,
        default=6,
        help="WebP encoder effort (0-6). Higher is slower but smaller.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing WebP outputs.",
    )
    return parser.parse_args()


def find_banner_pngs(images_dir: Path) -> list[Path]:
    if not images_dir.exists():
        raise FileNotFoundError(f"Images directory not found: {images_dir}")

    return sorted(
        path
        for path in images_dir.iterdir()
        if path.is_file() and BANNER_PATTERN.match(path.name)
    )


def convert_banner(
    source: Path,
    *,
    max_width: int,
    quality: int,
    method: int,
    force: bool,
) -> ConversionResult | None:
    output = source.with_suffix(".webp")
    if output.exists() and not force:
        return None

    with Image.open(source) as image:
        image = image.convert("RGB")
        original_size = image.size

        if image.width > max_width:
            ratio = max_width / image.width
            new_size = (max_width, max(1, round(image.height * ratio)))
            image = image.resize(new_size, Image.Resampling.LANCZOS)

        output_size = image.size
        image.save(output, "WEBP", quality=quality, method=method)

    return ConversionResult(
        source=source,
        output=output,
        original_bytes=source.stat().st_size,
        output_bytes=output.stat().st_size,
        original_size=original_size,
        output_size=output_size,
    )


def format_kb(num_bytes: int) -> str:
    return f"{num_bytes / 1024:.1f} KB"


def main() -> int:
    args = parse_args()
    banners = find_banner_pngs(args.images_dir)

    if not banners:
        print("No matching *_banner.png files found.")
        return 0

    converted = 0
    skipped = 0
    for banner in banners:
        result = convert_banner(
            banner,
            max_width=args.max_width,
            quality=args.quality,
            method=args.method,
            force=args.force,
        )
        if result is None:
            skipped += 1
            print(f"skip {banner.name} -> {banner.with_suffix('.webp').name} (already exists)")
            continue

        converted += 1
        savings = 100 - ((result.output_bytes / result.original_bytes) * 100)
        print(
            f"ok   {result.source.name} {result.original_size[0]}x{result.original_size[1]} "
            f"-> {result.output.name} {result.output_size[0]}x{result.output_size[1]} | "
            f"{format_kb(result.original_bytes)} -> {format_kb(result.output_bytes)} "
            f"({savings:.1f}% smaller)"
        )

    print(f"done converted={converted} skipped={skipped}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
