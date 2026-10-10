"""Builds a silent walkthrough video (loadbond-walkthrough.mp4) from slides/NN.png.

Requires the imageio-ffmpeg package for its bundled ffmpeg binary. Run render.ps1 first.
"""
import subprocess
from pathlib import Path

import imageio_ffmpeg

HERE = Path(__file__).parent
SECONDS = [8, 14, 16, 18, 14, 16, 16, 14, 18, 16, 14, 9]


def main() -> None:
    slides = sorted((HERE / "slides").glob("*.png"))
    if len(slides) != len(SECONDS):
        raise SystemExit(f"expected {len(SECONDS)} slides, found {len(slides)}")
    listing = HERE / "slides" / "concat.txt"
    lines = []
    for slide, seconds in zip(slides, SECONDS):
        lines += [f"file '{slide.name}'", f"duration {seconds}"]
    lines.append(f"file '{slides[-1].name}'")
    listing.write_text("\n".join(lines) + "\n", encoding="utf-8")
    out = HERE / "loadbond-walkthrough.mp4"
    subprocess.run(
        [imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
         "-i", str(listing), "-vf", "scale=1920:1080,fps=30,format=yuv420p",
         "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-movflags", "+faststart", str(out)],
        check=True,
    )
    listing.unlink()
    print(out, f"{out.stat().st_size / 1e6:.1f} MB", f"{sum(SECONDS)} s")


if __name__ == "__main__":
    main()
