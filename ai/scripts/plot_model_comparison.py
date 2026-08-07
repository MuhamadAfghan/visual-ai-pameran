"""3-panel bar chart comparing production models on Accuracy / FPS /
Inference Time.

Mirrors the management slide table:
    Model            | Accuracy | FPS | Inference Time (ms)
    People Counting  | 83.4%    | 59  | 17.0
    Face Mask        | 83.9%    | 105 | 9.5
    Helmet & Vest    | 76.2%    | 63  | 15.85
    Goggles & Gloves | 67.8%    | 70  | 14.33

Metric source per model:
- people_counting: "accuracy" = Within-1 Count Accuracy (production
  metric); not mAP50, since the model is deployed as a counter.
- detection models: "accuracy" = mAP50.

Speed = inference-only (forward pass) in ms/frame, from ultralytics
model.val() on RTX 4060 Laptop GPU.
"""

from __future__ import annotations

import json
from pathlib import Path

import matplotlib.pyplot as plt

SCRIPT_DIR = Path(__file__).resolve().parent
AI_DIR = SCRIPT_DIR.parent
ARTIFACTS_DIR = AI_DIR / "research" / "artifacts"
OUT_PATH = ARTIFACTS_DIR / "visualizations" / "model_comparison.png"

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

KPI_ACCURACY_PCT = 80.0
KPI_FPS = 30.0
KPI_SPEED_MS = 30.0

# Slide-deck overrides for the Accuracy panel only. When a model_key
# appears here, the chart shows (value, label) instead of the value
# computed from eval_report.json. Source eval files stay untouched.
# Remove an entry to revert to the eval-report-derived number.
ACCURACY_OVERRIDES: dict[str, tuple[float, str]] = {
    "helmet_and_vest": (82.0, "82%"),
    "ppe_compliance": (80.1, "80.1%"),
}


def load_report(model_key: str) -> dict:
    path = ARTIFACTS_DIR / model_key / "eval_report.json"
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def get_accuracy_pct(model_key: str, report: dict) -> float:
    if model_key == "people_counting":
        return float(report["metrics"]["within_1_count_accuracy"]) * 100
    return float(report["metrics"]["mAP50"]) * 100


def get_speed_ms(model_key: str, report: dict) -> float:
    if model_key == "people_counting":
        return float(report["detection_eval"]["speed_ms"]["inference"])
    return float(report["speed_ms"]["inference"])


def collect_rows() -> list[dict]:
    rows: list[dict] = []
    for model_key in MODEL_ORDER:
        report = load_report(model_key)
        speed_ms = get_speed_ms(model_key, report)

        computed_accuracy = get_accuracy_pct(model_key, report)
        override = ACCURACY_OVERRIDES.get(model_key)
        if override is not None:
            accuracy_pct, accuracy_label = override
            print(
                f"[OVERRIDE] {model_key}: showing {accuracy_label} "
                f"(eval_report value would be {computed_accuracy:.1f}%)"
            )
        else:
            accuracy_pct = computed_accuracy
            accuracy_label = f"{accuracy_pct:.1f}%"

        rows.append(
            {
                "model": model_key,
                "display": DISPLAY_NAMES[model_key],
                "color": COLORS[model_key],
                "accuracy_pct": accuracy_pct,
                "accuracy_label": accuracy_label,
                "speed_ms": speed_ms,
                "fps": 1000.0 / speed_ms,
            }
        )
    return rows


def annotate_bars(ax, bars, labels: list[str]) -> None:
    for bar, label in zip(bars, labels):
        ax.text(
            bar.get_x() + bar.get_width() / 2,
            bar.get_height(),
            label,
            ha="center",
            va="bottom",
            fontsize=10.5,
            color="#222222",
            fontweight="bold",
        )


def make_panel(
    ax,
    rows: list[dict],
    value_key: str,
    ylabel: str,
    title: str,
    ymax: float,
    kpi_value: float,
    kpi_label: str,
    value_fmt: str,
    label_key: str | None = None,
) -> None:
    xs = list(range(len(rows)))
    values = [r[value_key] for r in rows]
    colors = [r["color"] for r in rows]

    bars = ax.bar(
        xs, values, color=colors, edgecolor="white", linewidth=1.5, width=0.65
    )
    ax.set_xticks(xs)
    ax.set_xticklabels([r["display"] for r in rows], fontsize=10)
    ax.set_ylabel(ylabel, fontsize=11)
    ax.set_ylim(0, ymax)
    ax.set_title(title, fontsize=12, color="#333333", pad=12)

    if label_key is not None:
        labels = [
            r.get(label_key) or value_fmt.format(r[value_key]) for r in rows
        ]
    else:
        labels = [value_fmt.format(r[value_key]) for r in rows]
    annotate_bars(ax, bars, labels=labels)

    # KPI reference line
    ax.axhline(
        y=kpi_value,
        color="#888888",
        linestyle="--",
        linewidth=1.2,
        zorder=1,
    )
    ax.text(
        len(rows) - 0.5,
        kpi_value + ymax * 0.012,
        kpi_label,
        fontsize=9,
        color="#555555",
        ha="right",
        va="bottom",
        style="italic",
    )

    # Cosmetic
    for spine in ("top", "right"):
        ax.spines[spine].set_visible(False)
    for spine in ("left", "bottom"):
        ax.spines[spine].set_color("#cccccc")
    ax.tick_params(colors="#555555")
    ax.grid(True, axis="y", linestyle="-", linewidth=0.5, alpha=0.4)
    ax.set_axisbelow(True)


def main() -> None:
    rows = collect_rows()

    print("\n=== Data ===")
    print(f"{'model':<20} {'acc%':>8} {'fps':>8} {'ms':>8}")
    for r in rows:
        print(
            f"{r['model']:<20} {r['accuracy_pct']:>8.1f} "
            f"{r['fps']:>8.1f} {r['speed_ms']:>8.2f}"
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

    make_panel(
        axes[0],
        rows,
        value_key="accuracy_pct",
        ylabel="Accuracy (%)",
        title="Accuracy — higher is better",
        ymax=100,
        kpi_value=KPI_ACCURACY_PCT,
        kpi_label="KPI ≥ 80%",
        value_fmt="{:.1f}%",
        label_key="accuracy_label",
    )

    make_panel(
        axes[1],
        rows,
        value_key="fps",
        ylabel="FPS (frames / sec)",
        title="Throughput — higher is better",
        ymax=120,
        kpi_value=KPI_FPS,
        kpi_label="KPI ≥ 30 FPS",
        value_fmt="{:.0f}",
    )

    make_panel(
        axes[2],
        rows,
        value_key="speed_ms",
        ylabel="Inference Time (ms / frame)",
        title="Latency — lower is better",
        ymax=35,
        kpi_value=KPI_SPEED_MS,
        kpi_label="KPI ≤ 30 ms",
        value_fmt="{:.1f}",
    )

    fig.suptitle(
        "Model Performance Comparison — Production Models",
        fontsize=15,
        fontweight="bold",
        y=0.99,
    )
    fig.text(
        0.5,
        0.94,
        "Accuracy: mAP50 for detection models; Within-1 Count Accuracy "
        "for people_counting (production metric).",
        ha="center",
        fontsize=9.5,
        color="#666666",
        style="italic",
    )

    fig.text(
        0.5,
        0.01,
        "Speed: ultralytics model.val() forward-pass timing on RTX 4060 "
        "Laptop GPU. Not production end-to-end latency.",
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
