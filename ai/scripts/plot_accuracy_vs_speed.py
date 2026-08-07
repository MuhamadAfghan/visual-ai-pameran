"""Plot accuracy (mAP50) vs inference speed for production YOLO models.

Reads eval_report.json files under ai/research/artifacts/<usecase>/ and
renders a slide-ready scatter chart to
ai/research/artifacts/visualizations/accuracy_vs_speed.png.

Re-run after re-evaluating any model — the chart will pick up the latest
metrics automatically.
"""

from __future__ import annotations

import json
from pathlib import Path

import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle

SCRIPT_DIR = Path(__file__).resolve().parent
AI_DIR = SCRIPT_DIR.parent
ARTIFACTS_DIR = AI_DIR / "research" / "artifacts"
OUT_DIR = ARTIFACTS_DIR / "visualizations"
OUT_PATH = OUT_DIR / "accuracy_vs_speed.png"

DETECTION_MODELS = [
    "face_mask",
    "helmet_and_vest",
    "ppe_compliance",
    "people_counting",
]
COUNTING_MODEL = "people_counting"

KPI_MAP50 = 0.80
KPI_SPEED_MS = 30.0  # equivalent to ~30 FPS; binding speed KPI


def load_report(model_key: str) -> dict:
    path = ARTIFACTS_DIR / model_key / "eval_report.json"
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def extract_speed_ms(report: dict, model_key: str) -> float | None:
    speed = report.get("speed_ms")
    if not isinstance(speed, dict):
        print(f"[WARN] {model_key}: no 'speed_ms' block in eval_report.json — skipping")
        return None
    for field in ("inference", "total"):
        value = speed.get(field)
        if isinstance(value, (int, float)):
            return float(value)
    print(f"[WARN] {model_key}: neither 'inference' nor 'total' found in speed_ms — skipping")
    return None


def collect_detection_points() -> list[dict]:
    """Return one scatter point per model.

    people_counting stores its detection-level numbers under
    `detection_eval` (the top-level `metrics` block is counting-only).
    Other models keep mAP50/speed at the top level.
    """
    points: list[dict] = []
    for model_key in DETECTION_MODELS:
        report = load_report(model_key)
        det = report.get("detection_eval")
        if isinstance(det, dict):
            source = det
        else:
            source = report
        map50 = source.get("metrics", {}).get("mAP50")
        speed_ms = extract_speed_ms(source, model_key)
        if map50 is None:
            print(f"[WARN] {model_key}: no mAP50 found — skipping")
            continue
        if speed_ms is None:
            continue
        points.append({"model": model_key, "map50": float(map50), "speed_ms": speed_ms})
    return points


def collect_counting_summary() -> dict | None:
    report = load_report(COUNTING_MODEL)
    metrics = report.get("metrics", {})
    if not metrics:
        return None
    return {
        "mae": metrics.get("mae"),
        "within1": metrics.get("within_1_count_accuracy"),
    }


def print_extracted(points: list[dict], counting: dict | None) -> None:
    print("\n=== Extracted data ===")
    print(f"{'model':<20} {'mAP50':>8} {'speed_ms':>10} {'FPS':>8}")
    for p in points:
        fps = 1000.0 / p["speed_ms"]
        print(
            f"{p['model']:<20} {p['map50']:>8.4f} {p['speed_ms']:>10.3f} {fps:>8.1f}"
        )
    if counting is not None:
        mae = counting.get("mae")
        within1 = counting.get("within1")
        print(
            f"{COUNTING_MODEL:<20} (counting) MAE={mae} | Within-1 Acc={within1}"
        )
    print()


def build_plot(points: list[dict], counting: dict | None, out_path: Path) -> None:
    plt.style.use("seaborn-v0_8-whitegrid")
    plt.rcParams.update(
        {
            "font.family": "DejaVu Sans",
            "axes.titlesize": 14,
            "axes.labelsize": 12,
            "xtick.labelsize": 10,
            "ytick.labelsize": 10,
        }
    )

    fig, ax = plt.subplots(figsize=(10, 6))

    palette = ["#1f77b4", "#2ca02c", "#ff7f0e", "#9467bd"]

    max_speed = max(p["speed_ms"] for p in points)
    x_max = max(max_speed * 1.25, KPI_SPEED_MS + 8)
    ax.set_xlim(0, x_max)
    ax.set_ylim(0.6, 1.0)

    # Optimal zone: speed ≤ 30 ms AND mAP50 ≥ 0.80
    opt_rect = Rectangle(
        (0, KPI_MAP50),
        KPI_SPEED_MS,
        1.0 - KPI_MAP50,
        facecolor="#2ca02c",
        alpha=0.08,
        edgecolor="none",
        zorder=0,
    )
    ax.add_patch(opt_rect)
    ax.text(
        KPI_SPEED_MS - 0.6,
        0.985,
        "Optimal Zone",
        fontsize=9,
        color="#2ca02c",
        ha="right",
        va="top",
        style="italic",
    )

    # KPI horizontal line (accuracy)
    ax.axhline(
        y=KPI_MAP50,
        color="#888888",
        linestyle="--",
        linewidth=1.3,
        zorder=1,
    )
    ax.text(
        x_max - 0.3,
        KPI_MAP50 + 0.008,
        "KPI Target (mAP50 ≥ 0.80)",
        fontsize=9,
        color="#555555",
        ha="right",
        va="bottom",
    )

    # KPI vertical line (speed)
    ax.axvline(
        x=KPI_SPEED_MS,
        color="#888888",
        linestyle="--",
        linewidth=1.3,
        zorder=1,
    )
    ax.text(
        KPI_SPEED_MS + 0.4,
        0.615,
        "KPI Target\n(≤ 30 ms / ≥ 30 FPS)",
        fontsize=9,
        color="#555555",
        ha="left",
        va="bottom",
    )

    # Scatter points
    label_anchors = {
        "face_mask": {"offset": (12, 14), "ha": "left"},
        "helmet_and_vest": {"offset": (12, 18), "ha": "left"},
        "ppe_compliance": {"offset": (-12, -28), "ha": "right"},
        "people_counting": {"offset": (12, -22), "ha": "left"},
    }
    for idx, p in enumerate(points):
        color = palette[idx % len(palette)]
        fps = 1000.0 / p["speed_ms"]
        ax.scatter(
            p["speed_ms"],
            p["map50"],
            s=200,
            color=color,
            edgecolor="white",
            linewidth=1.5,
            zorder=3,
        )
        anchor = label_anchors.get(
            p["model"], {"offset": (12, 12), "ha": "left"}
        )
        ax.annotate(
            f"{p['model']}\nmAP50 {p['map50']:.2f}  ·  {fps:.0f} FPS",
            xy=(p["speed_ms"], p["map50"]),
            xytext=anchor["offset"],
            textcoords="offset points",
            fontsize=10,
            color="#222222",
            ha=anchor["ha"],
            va="center",
        )

    # Axis labels
    ax.set_xlabel("Inference Speed (ms/frame, model-only)")
    ax.set_ylabel("mAP50 (Detection Accuracy)")

    # Secondary x-axis: equivalent FPS at nice breakpoints
    ax_top = ax.twiny()
    ax_top.set_xlim(ax.get_xlim())
    fps_marks = [200, 100, 60, 30]
    tick_positions = [1000.0 / f for f in fps_marks if 0 < 1000.0 / f < x_max]
    tick_labels = [f"{f}" for f in fps_marks if 0 < 1000.0 / f < x_max]
    ax_top.set_xticks(tick_positions)
    ax_top.set_xticklabels(tick_labels)
    ax_top.set_xlabel("Inference Speed (FPS) — higher is better", labelpad=8)
    ax_top.tick_params(colors="#555555")
    for spine in ("top", "right", "left"):
        ax_top.spines[spine].set_visible(False)
    ax_top.spines["bottom"].set_visible(False)
    ax_top.grid(False)

    # Direction-of-better arrows
    ax.text(
        0.02,
        -0.13,
        "← faster",
        transform=ax.transAxes,
        fontsize=9,
        color="#555555",
        ha="left",
        va="top",
        style="italic",
    )
    ax.text(
        -0.085,
        0.98,
        "higher ↑",
        transform=ax.transAxes,
        fontsize=9,
        color="#555555",
        ha="left",
        va="top",
        style="italic",
        rotation=90,
    )

    # Title + subtitle (placed above the secondary FPS axis)
    fig.suptitle(
        "Accuracy vs Speed — Production Models",
        fontsize=14,
        fontweight="bold",
        y=0.985,
    )
    fig.text(
        0.5,
        0.935,
        "Lower latency + higher accuracy = better",
        ha="center",
        va="top",
        fontsize=11,
        color="#555555",
    )

    # people_counting note: marker shows detection-level mAP50, but the
    # model is deployed as a counter — surface its counting metrics too.
    if counting is not None:
        mae = counting.get("mae")
        within1 = counting.get("within1")
        within1_pct = f"{within1 * 100:.1f}%" if isinstance(within1, (int, float)) else "n/a"
        mae_str = f"{mae:.2f}" if isinstance(mae, (int, float)) else "n/a"
        note = (
            "people_counting marker shows detection mAP50; in production it is "
            f"evaluated as a counting task — MAE {mae_str}, Within-1 Acc {within1_pct}."
        )
        fig.text(
            0.5,
            0.05,
            note,
            ha="center",
            va="center",
            fontsize=9.5,
            color="#333333",
            bbox=dict(
                boxstyle="round,pad=0.5",
                facecolor="#f5f5f5",
                edgecolor="#cccccc",
                linewidth=0.8,
            ),
        )

    # Footer note about timing methodology
    fig.text(
        0.5,
        0.005,
        "Speed: ultralytics model.val() timing on RTX 4060 Laptop GPU "
        "(preprocess + forward + postprocess). Not production end-to-end latency.",
        ha="center",
        va="bottom",
        fontsize=8,
        color="#777777",
        style="italic",
    )

    # Cosmetic cleanup
    for spine in ("top", "right"):
        ax.spines[spine].set_visible(False)
    for spine in ("left", "bottom"):
        ax.spines[spine].set_color("#cccccc")
    ax.tick_params(colors="#555555")
    ax.grid(True, linestyle="-", linewidth=0.5, alpha=0.5)

    fig.tight_layout(rect=(0.02, 0.09, 1.0, 0.90))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, dpi=300, bbox_inches="tight", facecolor="white")
    plt.close(fig)


def main() -> None:
    points = collect_detection_points()
    counting = collect_counting_summary()
    print_extracted(points, counting)

    if not points:
        print("[ERROR] No detection points to plot — aborting.")
        return

    build_plot(points, counting, OUT_PATH)
    print(f"Saved: {OUT_PATH}")


if __name__ == "__main__":
    main()
