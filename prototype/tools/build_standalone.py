#!/usr/bin/env python3
"""파일 하나로 합친 standalone.html을 만든다.

휴대폰에서 index.html만 열면(content://, 카카오톡·파일 관리자 등) 같은 폴더의 styles.css,
app.js, images/를 찾지 못해 스타일과 스크립트 없이 글자만 보인다. 이 스크립트는 CSS와 JS를
HTML 안에 넣고 포스터 이미지를 줄여서 data: 주소로 넣어, 파일 하나만으로 동작하게 한다.

사용: python tools/build_standalone.py [--max-width 900] [--quality 75]
결과: prototype/standalone.html (원본 파일은 바꾸지 않는다)
"""
import argparse
import base64
import io
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent


def data_uri(path: Path, max_width: int, quality: int) -> str:
    img = Image.open(path)
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGBA")
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[-1])
        img = bg
    else:
        img = img.convert("RGB")
    if img.width > max_width:
        img = img.resize((max_width, round(img.height * max_width / img.width)), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=quality, optimize=True)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-width", type=int, default=900)
    ap.add_argument("--quality", type=int, default=75)
    args = ap.parse_args()

    read = lambda name: (ROOT / name).read_text(encoding="utf-8")
    html, css = read("index.html"), read("styles.css")
    scripts = {n: read(n) for n in ("data.js", "filter.js", "app.js")}

    # 이미지: data.js의 src: "images/…"를 줄인 data: 주소로 바꾼다.
    count = 0

    def embed(m):
        nonlocal count
        count += 1
        return 'src: "' + data_uri(ROOT / m.group(1), args.max_width, args.quality) + '"'

    scripts["data.js"] = re.sub(r'src:\s*"(images/[^"]+)"', embed, scripts["data.js"])

    for name, body in scripts.items():
        if "</script" in body.lower():
            print(f"오류: {name}에 </script가 있어 인라인할 수 없다", file=sys.stderr)
            return 1

    out = html.replace('<link rel="stylesheet" href="styles.css">', "<style>\n" + css + "\n</style>")
    for name, body in scripts.items():
        tag = f'<script src="{name}"></script>'
        if tag not in out:
            print(f"오류: index.html에서 {tag}를 찾지 못했다", file=sys.stderr)
            return 1
        out = out.replace(tag, "<script>\n" + body + "\n</script>")
    if 'href="styles.css"' in out or 'src="data.js"' in out:
        print("오류: 아직 외부 파일을 참조한다", file=sys.stderr)
        return 1

    target = ROOT / "standalone.html"
    target.write_text(out, encoding="utf-8")
    print(f"{target.name}: {target.stat().st_size / 1024 / 1024:.2f}MB, 이미지 {count}장 (최대 폭 {args.max_width}px, 품질 {args.quality})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
