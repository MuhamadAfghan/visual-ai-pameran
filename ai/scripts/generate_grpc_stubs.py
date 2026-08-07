"""Generate Python gRPC stubs dari proto/ai/v1/inference.proto.

Output:
    ai/src/ai/v1/inference_pb2.py
    ai/src/ai/v1/inference_pb2_grpc.py

Jalankan ulang setiap kali proto file berubah:
    python scripts/generate_grpc_stubs.py
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def main() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    proto_dir = repo_root / "proto"
    out_dir = repo_root / "src"
    proto_file = proto_dir / "ai" / "v1" / "inference.proto"

    if not proto_file.exists():
        print(f"[error] proto file not found: {proto_file}", file=sys.stderr)
        sys.exit(1)

    out_dir.mkdir(parents=True, exist_ok=True)

    cmd = [
        sys.executable,
        "-m",
        "grpc_tools.protoc",
        f"-I={proto_dir}",
        f"--python_out={out_dir}",
        f"--grpc_python_out={out_dir}",
        str(proto_file),
    ]
    print("[info] running:", " ".join(cmd))
    result = subprocess.run(cmd, check=False)
    if result.returncode != 0:
        sys.exit(result.returncode)

    for sub in ("ai", "ai/v1"):
        init = out_dir / sub / "__init__.py"
        if not init.exists():
            init.write_text("", encoding="utf-8")

    print(f"[ok] stubs generated under {out_dir}/ai/v1/")


if __name__ == "__main__":
    main()
