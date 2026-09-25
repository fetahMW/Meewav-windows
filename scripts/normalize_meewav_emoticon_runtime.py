"""Normalize transparent padding in MeeWav runtime WebP emoticons.

The PNG sources remain untouched. Each visible alpha bounding box is resized
onto a 256px transparent canvas so packs exported with excess whitespace render
at the same perceived size as the rest of the catalog.
"""

from __future__ import annotations

import argparse
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

from PIL import Image


def normalized_runtime_image(source: Image.Image, *, canvas_size: int, content_size: int, alpha_cutoff: int) -> Image.Image:
    rgba = source.convert("RGBA")
    alpha = rgba.getchannel("A")
    bounds = alpha.point(lambda value: 255 if value > alpha_cutoff else 0).getbbox()
    if bounds is None:
        raise ValueError("emoticon has no visible alpha content")

    cropped = rgba.crop(bounds)
    scale = min(content_size / cropped.width, content_size / cropped.height)
    width = max(1, round(cropped.width * scale))
    height = max(1, round(cropped.height * scale))
    resized = cropped.resize((width, height), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    canvas.alpha_composite(resized, ((canvas_size - width) // 2, (canvas_size - height) // 2))
    return canvas


def save_runtime(source: Image.Image, destination: Path, *, canvas_size: int, content_size: int, alpha_cutoff: int) -> None:
    normalized = normalized_runtime_image(
        source,
        canvas_size=canvas_size,
        content_size=content_size,
        alpha_cutoff=alpha_cutoff,
    )
    normalized.save(destination, "WEBP", quality=90, method=6, exact=True)


def normalize_directory(source_dir: Path, output_dir: Path, *, canvas_size: int, content_size: int, alpha_cutoff: int) -> int:
    processed = 0
    for destination in sorted(output_dir.glob("*.webp")):
        candidates = [source_dir / f"{destination.stem}{suffix}" for suffix in (".webp", ".png")]
        source_path = next((candidate for candidate in candidates if candidate.is_file()), None)
        if source_path is None:
            raise FileNotFoundError(f"missing source for {destination.name}")
        with Image.open(source_path) as opened_source:
            source = opened_source.convert("RGBA")
        save_runtime(source, destination, canvas_size=canvas_size, content_size=content_size, alpha_cutoff=alpha_cutoff)
        processed += 1
    return processed


def normalize_zip(source_zip: Path, zip_prefix: str, output_dir: Path, *, canvas_size: int, content_size: int, alpha_cutoff: int) -> int:
    processed = 0
    prefix = zip_prefix.rstrip("/") + "/"
    with ZipFile(source_zip) as archive:
        sources = {
            Path(name).stem: name
            for name in archive.namelist()
            if name.startswith(prefix) and name.lower().endswith((".png", ".webp"))
        }
        for destination in sorted(output_dir.glob("*.webp")):
            member = sources.get(destination.stem)
            if member is None:
                raise FileNotFoundError(f"missing source for {destination.name} in {source_zip}")
            with Image.open(BytesIO(archive.read(member))) as source:
                save_runtime(source, destination, canvas_size=canvas_size, content_size=content_size, alpha_cutoff=alpha_cutoff)
            processed += 1
    return processed


def main() -> None:
    parser = argparse.ArgumentParser()
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--source-dir", type=Path)
    source.add_argument("--source-zip", type=Path)
    parser.add_argument("--zip-prefix", default="")
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--canvas-size", type=int, default=256)
    parser.add_argument("--content-size", type=int, default=220)
    parser.add_argument("--alpha-cutoff", type=int, default=2)
    args = parser.parse_args()

    if not args.output_dir.is_dir():
        raise FileNotFoundError(args.output_dir)
    if not 0 < args.content_size <= args.canvas_size:
        raise ValueError("content-size must fit inside canvas-size")

    if args.source_dir is not None:
        count = normalize_directory(
            args.source_dir,
            args.output_dir,
            canvas_size=args.canvas_size,
            content_size=args.content_size,
            alpha_cutoff=args.alpha_cutoff,
        )
    else:
        if not args.zip_prefix:
            raise ValueError("zip-prefix is required with source-zip")
        count = normalize_zip(
            args.source_zip,
            args.zip_prefix,
            args.output_dir,
            canvas_size=args.canvas_size,
            content_size=args.content_size,
            alpha_cutoff=args.alpha_cutoff,
        )
    print(f"normalized {count} runtime emoticons in {args.output_dir}")


if __name__ == "__main__":
    main()
