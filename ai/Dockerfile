# ── Stage 1: Build ─────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /app

# System deps for OpenCV
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# CUDA-enabled torch build, installed before requirements.txt: ultralytics
# only floors torch (no exact pin), so this stays untouched by the plain-PyPI
# install below.
#
# The wheel has to match BOTH the CPU architecture and the GPU compute
# capability of whichever machine runs the image, and the two deploy targets
# are nothing alike:
#
#   linux/amd64 — dev workstation, Quadro M2200 (Maxwell, sm_52).
#                 2.7.1 is the newest release still shipping sm_52 kernels;
#                 2.8.0+ dropped Maxwell.
#   linux/arm64 — Acer Altos GB10 (Grace Blackwell, sm_121). Needs a CUDA 13
#                 build: the cu126 index has no aarch64 variant and no sm_121
#                 kernels. Left unpinned so the newest cu130 wheel wins — the
#                 verification step below is what guards correctness. Pin it
#                 via --build-arg TORCH_SPEC_ARM64="torch==X torchvision==Y"
#                 once a known-good pair is established.
#
# Both wheels bundle their own CUDA runtime libs (nvidia-cublas-cu12 etc.), so
# no nvidia/cuda base image is needed — only the driver's libcuda.so, injected
# at container start (Docker Desktop GPU-PV on the dev box,
# nvidia-container-toolkit on the GB10).
#
# NOTE: an arm64 image must be built ON the GB10 (or via
# `docker buildx build --platform linux/arm64`); a plain build on the dev box
# produces amd64.
ARG TARGETARCH
ARG TORCH_SPEC_AMD64="torch==2.7.1 torchvision==0.22.1"
ARG TORCH_INDEX_AMD64="https://download.pytorch.org/whl/cu126"
ARG TORCH_ARCH_AMD64="sm_52"
ARG TORCH_SPEC_ARM64="torch torchvision"
ARG TORCH_INDEX_ARM64="https://download.pytorch.org/whl/cu130"
ARG TORCH_ARCH_ARM64="sm_121"

RUN set -eux; \
    case "${TARGETARCH}" in \
      amd64) spec="${TORCH_SPEC_AMD64}"; index="${TORCH_INDEX_AMD64}"; arch="${TORCH_ARCH_AMD64}" ;; \
      arm64) spec="${TORCH_SPEC_ARM64}"; index="${TORCH_INDEX_ARM64}"; arch="${TORCH_ARCH_ARM64}" ;; \
      *) echo "Unsupported TARGETARCH='${TARGETARCH}'" >&2; exit 1 ;; \
    esac; \
    echo "${arch}" > /tmp/expected_sm; \
    pip install --no-cache-dir ${spec} --index-url "${index}"

# Fail the build here rather than shipping an image that silently runs every
# inference on CPU. get_arch_list() reads the wheel's compiled kernel set, so
# this works without a GPU attached to the builder.
RUN python -c "\
import sys, torch; \
want = open('/tmp/expected_sm').read().strip(); \
archs = torch.cuda.get_arch_list(); \
print('torch', torch.__version__, '| cuda', torch.version.cuda, '|', archs); \
sys.exit('FATAL: CPU-only torch wheel installed - wrong index URL?') if torch.version.cuda is None else None; \
sys.exit('FATAL: wheel ships no ' + want + ' kernels (got ' + str(archs) + ') - inference would fall back to CPU') if want not in archs else None"

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
