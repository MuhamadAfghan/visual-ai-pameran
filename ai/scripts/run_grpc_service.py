"""Entrypoint untuk gRPC inference server.

Env:
    AI_GRPC_HOST (default: 0.0.0.0)
    AI_GRPC_PORT (default: 50051)
    AI_GRPC_MAX_WORKERS (default: 8)
"""

from __future__ import annotations

import logging
import os

from cctv_insight_ai.service.grpc_app import serve


def main() -> None:
    logging.basicConfig(
        level=os.getenv("AI_LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    host = os.getenv("AI_GRPC_HOST", "0.0.0.0")
    port = int(os.getenv("AI_GRPC_PORT", "50051"))
    max_workers = int(os.getenv("AI_GRPC_MAX_WORKERS", "8"))
    serve(host=host, port=port, max_workers=max_workers)


if __name__ == "__main__":
    main()
