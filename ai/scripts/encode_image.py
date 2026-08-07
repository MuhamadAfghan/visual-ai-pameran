"""Encode gambar jadi base64 string untuk testing di Postman.

Pemakaian:
    python scripts/encode_image.py contracts/example-1.jpg
    python scripts/encode_image.py contracts/example-1.jpg --copy

Output base64 string ke stdout. Dengan --copy, otomatis masuk clipboard.
"""
from __future__ import annotations

import argparse
import base64
import sys
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Encode gambar ke base64")
    parser.add_argument("image", help="Path ke file gambar")
    parser.add_argument("--copy", action="store_true", help="Copy ke clipboard")
    args = parser.parse_args()

    path = Path(args.image)
    if not path.exists():
        print(f"File nggak ketemu: {path}", file=sys.stderr)
        sys.exit(1)

    b64 = base64.b64encode(path.read_bytes()).decode()

    if args.copy:
        try:
            import subprocess
            subprocess.run(
                ["powershell", "-Command", f"Set-Clipboard '{b64}'"],
                check=True,
            )
            print(f"Base64 ({len(b64)} chars) sudah di-copy ke clipboard.")
        except Exception as e:
            print(f"Gagal copy: {e}", file=sys.stderr)
            print(b64)
    else:
        print(b64)


if __name__ == "__main__":
    main()
