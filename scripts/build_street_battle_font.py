"""Build the live presentation subset without changing FIX mock fonts.

Usage: python scripts/build_street_battle_font.py /path/to/licensed/Tetsubin.otf
Requires fonttools and brotli. Original license: public/fonts/gacha-comparison/Apache-2.0.txt.
"""
from pathlib import Path
import sys
from fontTools import subset
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parents[1]
texts = [chr(i) for i in range(32, 127)]
for path in sorted((root / "src").rglob("*")):
    if path.suffix in (".tsx", ".ts", ".json"):
        texts.append(path.read_text(encoding="utf-8"))
font = TTFont(sys.argv[1])
for record in font["name"].names:
    if record.nameID in (1, 3, 4, 6, 16):
        record.string = "TNStreetLive".encode(record.getEncoding())
options = subset.Options()
options.flavor = "woff2"
subsetter = subset.Subsetter(options=options)
subsetter.populate(text="".join(texts))
subsetter.subset(font)
font.flavor = "woff2"
target = root / "public/effects/battle-live/tetsubin.woff2"
target.parent.mkdir(parents=True, exist_ok=True)
font.save(target)
print(f"{target.relative_to(root)}: {target.stat().st_size} bytes")
