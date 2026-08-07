"""Visualize sustained-inference stress test results.

Reads ai/research/artifacts/system_performance/stress_test.json (produced
by benchmark_sustained_inference.py) and renders a 3-panel chart for the
management slide:

  Panel 1: Latency distribution (box plot) under sustained load
  Panel 2: Sustained throughput (FPS)
  Panel 3: VRAM footprint per model + 4-models-loaded total vs GPU capacity
"""

from __future__ import annotations

import json
from pathlib import Path

import matplotlib.pyplot as plt

SCRIPT_DIR = Path(__file__).resolve().parent
AI_DIR = SCRIPT_DIR.parent
DATA_PATH = AI_DIR / "research" / "artifacts" / "system_performance" / "stress_test.json"
OUT_PATH = AI_DIR / "research" / "artifacts" / "visualizations" / "stress_test.png"

MODEL_ORDER = [
    "people_counting",
    "face_mask",
    "helmet_and_vest",
    "ppe_compliance",
]

DISPLAY_NAMES = {
    "people_counting": "People\nCounting",
    "face_mask": "Face\nMask",
    "helmet_and_vest": "Helmet\n& Vest",
    "ppe_compliance": "Goggles\n& Gloves",
}

COLORS = {
    "people_counting": "#9467bd",
    "face_mask": "#1f77b4",
    "helmet_and_vest": "#2ca02c",
    "ppe_compliance": "#ff7f0e",
}

KPI_LATENCY_MS = 30.0
KPI_FPS = 30.0


def load_report() -> dict:
    with DATA_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)


def style_axes(ax) -> None:
    for spine in ("top", "right"):
        ax.spines[spine].set_visible(False)
    for spine in ("left", "bottom"):
        ax.spines[spine].set_color("#cccccc")
    ax.tick_params(colors="#555555")
    ax.grid(True, axis="y", linestyle="-", linewidth=0.5, alpha=0.4)
    ax.set_axisbelow(True)


def make_latency_panel(ax, report: dict) -> None:
    data = [report["per_model"][k]["latency_samples_ms"] for k in MODEL_ORDER]
    n = len(MODEL_ORDER)
    xs = list(range(n))

    bp = ax.boxplot(
        data,
        positions=xs,
        widths=0.55,
        patch_artist=True,
        showfliers=True,
        flierprops=dict(
            marker="o",
            markersize=2.5,
            markerfacecolor="#666666",
            markeredgecolor="none",
            alpha=0.5,
        ),
        medianprops=dict(color="white", linewidth=1.8),
        whiskerprops=dict(color="#666666", linewidth=1),
        capprops=dict(color="#666666", linewidth=1),
    )
    for patch, key in zip(bp["boxes"], MODEL_ORDER):
        patch.set_facecolor(COLORS[key])
        patch.set_edgecolor("white")
        patch.set_linewidth(1.2)

    ax.set_xticks(xs)
    ax.set_xticklabels([DISPLAY_NAMES[k] for k in MODEL_ORDER], fontsize=10)
    ax.set_ylabel("Latency per frame (ms)", fontsize=11)

    max_value = max(max(d) for d in data)
    ymax = max(KPI_LATENCY_MS + 6, max_value + 4)
    ax.set_ylim(0, ymax)

    ax.axhline(
        KPI_LATENCY_MS, linestyle="--", color="#888888", linewidth=1.2, zorder=1
    )
    ax.text(
        n - 0.5,
        KPI_LATENCY_MS + ymax * 0.012,
        "KPI ≤ 30 ms",
        ha="right",
        va="bottom",
        fontsize=9,
        color="#555555",
        style="italic",
    )

    # p99 annotation per model
    for i, k in enumerate(MODEL_ORDER):
        p99 = report["per_model"][k]["p99_ms"]
        ax.text(
            i,
            max(data[i]) + ymax * 0.025,
            f"p99 {p99:.1f}",
            ha="center",
            va="bottom",
            fontsize=9,
            color="#333333",
            fontweight="bold",
        )

    n_iter = report["benchmark_cfg"]["n_iterations"]
    ax.set_title(
        f"Latency distribution — {n_iter} frames sustained",
        fontsize=12,
        color="#333333",
        pad=12,
    )
    style_axes(ax)


def make_throughput_panel(ax, report: dict) -> None:
    n = len(MODEL_ORDER)
    fps_values = [report["per_model"][k]["throughput_fps"] for k in MODEL_ORDER]
    colors = [COLORS[k] for k in MODEL_ORDER]

    bars = ax.bar(
        range(n),
        fps_values,
        color=colors,
        edgecolor="white",
        linewidth=1.5,
        width=0.65,
    )
    ax.set_xticks(range(n))
    ax.set_xticklabels([DISPLAY_NAMES[k] for k in MODEL_ORDER], fontsize=10)
    ax.set_ylabel("Sustained throughput (FPS)", fontsize=11)

    ymax = max(60, max(fps_values) * 1.3)
    ax.set_ylim(0, ymax)

    ax.axhline(
        KPI_FPS, linestyle="--", color="#888888", linewidth=1.2, zorder=1
    )
    ax.text(
        n - 0.5,
        KPI_FPS + ymax * 0.012,
        "KPI ≥ 30 FPS",
        ha="right",
        va="bottom",
        fontsize=9,
        color="#555555",
        style="italic",
    )

    for bar, value in zip(bars, fps_values):
        ax.text(
            bar.get_x() + bar.get_width() / 2,
            value,
            f"{value:.0f}",
            ha="center",
            va="bottom",
            fontsize=10.5,
            fontweight="bold",
            color="#222222",
        )

    ax.set_title(
        "Sustained throughput",
        fontsize=12,
        color="#333333",
        pad=12,
    )
    style_axes(ax)


def make_vram_panel(ax, report: dict) -> None:
    per_model = [report["per_model"][k]["vram_reserved_gb"] for k in MODEL_ORDER]
    total_loaded = report["all_loaded"]["total_vram_reserved_gb"]
    gpu_total = report["benchmark_cfg"]["total_vram_gb"]

    n = len(MODEL_ORDER)
    xs = list(range(n)) + [n + 0.6]
    values = per_model + [total_loaded]
    colors = [COLORS[k] for k in MODEL_ORDER] + ["#444444"]
    labels = [DISPLAY_NAMES[k] for k in MODEL_ORDER] + ["All 4\nLoaded"]

    bars = ax.bar(
        xs,
        values,
        color=colors,
        edgecolor="white",
        linewidth=1.5,
        width=0.65,
    )
    ax.set_xticks(xs)
    ax.set_xticklabels(labels, fontsize=10)
    ax.set_ylabel("GPU memory reserved (GB)", fontsize=11)
    ax.set_ylim(0, gpu_total)

    ax.axhline(
        gpu_total, linestyle="--", color="#aa3333", linewidth=1.3, zorder=1
    )
    ax.text(
        xs[-1] + 0.4,
        gpu_total - 0.08,
        f"GPU capacity {gpu_total:.0f} GB",
        ha="right",
        va="top",
        fontsize=9,
        color="#aa3333",
        style="italic",
    )

    for bar, value in zip(bars, values):
        ax.text(
            bar.get_x() + bar.get_width() / 2,
            value + gpu_total * 0.012,
            f"{value:.2f} GB",
            ha="center",
            va="bottom",
            fontsize=10,
            fontweight="bold",
            color="#222222",
        )

    headroom_pct = (gpu_total - total_loaded) / gpu_total * 100
    ax.set_title(
        f"VRAM footprint — {headroom_pct:.0f}% headroom on 8 GB GPU",
        fontsize=12,
        color="#333333",
        pad=12,
    )
    style_axes(ax)


def main() -> None:
    report = load_report()

    print("\n=== Stress test summary ===")
    print(
        f"{'model':<20} {'p50':>7} {'p95':>7} {'p99':>7} "
        f"{'FPS':>7} {'VRAM_GB':>9}"
    )
    for k in MODEL_ORDER:
        m = report["per_model"][k]
        print(
            f"{k:<20} {m['p50_ms']:>7.2f} {m['p95_ms']:>7.2f} "
            f"{m['p99_ms']:>7.2f} {m['throughput_fps']:>7.1f} "
            f"{m['vram_reserved_gb']:>9.3f}"
        )
    print(
        f"\nAll 4 models loaded: "
        f"{report['all_loaded']['total_vram_reserved_gb']:.2f} GB "
        f"/ {report['benchmark_cfg']['total_vram_gb']:.0f} GB total"
    )

    plt.style.use("seaborn-v0_8-whitegrid")
    plt.rcParams.update(
        {
            "font.family": "DejaVu Sans",
            "axes.titlesize": 12,
            "axes.labelsize": 11,
            "xtick.labelsize": 10,
            "ytick.labelsize": 10,
        }
    )

    fig, axes = plt.subplots(1, 3, figsize=(14, 5.5))
    make_latency_panel(axes[0], report)
    make_throughput_panel(axes[1], report)
    make_vram_panel(axes[2], report)

    fig.suptitle(
        "Stress Test — Sustained Inference (200 frames per model)",
        fontsize=15,
        fontweight="bold",
        y=0.99,
    )
    fig.text(
        0.5,
        0.94,
        "All models maintain stable latency under continuous load; "
        "4 models fit comfortably within GPU capacity.",
        ha="center",
        fontsize=9.5,
        color="#666666",
        style="italic",
    )
    cfg = report["benchmark_cfg"]
    fig.text(
        0.5,
        0.01,
        f"Methodology: model.predict() in Python loop, {cfg['n_iterations']} frames "
        f"after {cfg['warmup']} warm-up frames, imgsz {cfg['imgsz']}. "
        f"GPU: {cfg['gpu_name']}. Service-level HTTP load test would be a separate benchmark.",
        ha="center",
        fontsize=8.5,
        color="#777777",
        style="italic",
    )

    fig.tight_layout(rect=(0.0, 0.04, 1.0, 0.92))
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(OUT_PATH, dpi=300, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print(f"\nSaved: {OUT_PATH}")


if __name__ == "__main__":
    main()
