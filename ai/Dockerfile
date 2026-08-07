# ── Stage 1: Build ─────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /app

# System deps for OpenCV
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY pyproject.toml .
COPY src ./src
RUN pip install --no-cache-dir -e .

# ── Stage 2: Runtime ────────────────────────────────────────
FROM python:3.12-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

COPY src ./src
COPY scripts ./scripts
COPY proto ./proto
COPY pyproject.toml .

# Model weights volume mount point
RUN mkdir -p /app/models

EXPOSE 50051

CMD ["python", "scripts/run_grpc_service.py"]
