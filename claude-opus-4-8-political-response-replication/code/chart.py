#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Render the topline 100% stacked-bar chart from data/summary-statistics.csv.

The chart script contains no hard-coded percentages; every value is read from
the summary CSV produced by code/analyze.mjs.
"""

import csv
import pathlib

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[1]
SUMMARY = ROOT / "data" / "summary-statistics.csv"
ASSETS = ROOT / "assets"

COLORS = {"left": "#2563EB", "both": "#7C3AED", "right": "#DC2626"}
CATEGORY_TITLES = {"left": "Left-only", "both": "Both", "right": "Right-only"}
ROW_ORDER = [
    "Washington Post Experiment",
    "Replication of WaPo",
    "No Word Limit",
    "No System Prompt",
    "No Fringe Questions",
]


def load_rows():
    with SUMMARY.open(newline="", encoding="utf-8") as handle:
        indexed = {row["label"]: row for row in csv.DictReader(handle)}
    missing = [label for label in ROW_ORDER if label not in indexed]
    if missing:
        raise SystemExit(f"summary-statistics.csv is missing rows: {missing}")
    return [indexed[label] for label in ROW_ORDER]


def main():
    rows = load_rows()
    figure, axis = plt.subplots(figsize=(13.2, 8.4), dpi=170)

    bar_height = 0.52
    pitch = 1.18          # vertical distance between physical rows
    divider_gap = 0.72    # extra space for the divider + note before No Fringe

    # Top-down y centers.
    y_positions = []
    y = 0.0
    for label in ROW_ORDER:
        if label == "No Fringe Questions":
            y += divider_gap
        y_positions.append(y)
        y += pitch
    top = max(y_positions)
    y_positions = [top - value for value in y_positions]

    for row, y_center in zip(rows, y_positions):
        start = 0.0
        for category in ("left", "both", "right"):
            value = float(row[f"{category}_only_pct"] if category != "both" else row["both_pct"])
            axis.barh(
                y_center,
                value,
                left=start,
                height=bar_height,
                color=COLORS[category],
                edgecolor="white",
                linewidth=0.8,
            )
            if value >= 8:
                axis.text(
                    start + value / 2,
                    y_center,
                    f"{value:.1f}%",
                    ha="center",
                    va="center",
                    color="white",
                    fontsize=11,
                    fontweight="bold",
                )
            start += value

        axis.text(
            101.4,
            y_center,
            f"{row['topics']} topics · n={row['n']}",
            ha="left",
            va="center",
            fontsize=9.5,
            color="#444444",
        )
        values_line = "   ".join(
            f"{CATEGORY_TITLES[category]} {float(row[f'{category}_only_pct'] if category != 'both' else row['both_pct']):.1f}% "
            f"({row[f'{category}_only_n'] if category != 'both' else row['both_n']})"
            for category in ("left", "both", "right")
        )
        axis.text(
            0,
            y_center - bar_height / 2 - 0.14,
            values_line,
            ha="left",
            va="top",
            fontsize=8.8,
            color="#666666",
        )

    # Divider between the physical rows and the derived No Fringe row. The note
    # sits below the divider, attached to the row it describes.
    divider_y = y_positions[4] + pitch / 2 + divider_gap / 2 - 0.06
    axis.axhline(divider_y, color="#AAAAAA", linewidth=0.9, linestyle=(0, (4, 3)))
    axis.text(
        0,
        divider_y - 0.13,
        f"Derived from the No System Prompt responses ({rows[4]['topics']}-topic subset) — not an independent run.",
        fontsize=8.8,
        style="italic",
        color="#777777",
        ha="left",
        va="top",
    )

    axis.set_yticks(y_positions)
    axis.set_yticklabels(ROW_ORDER, fontsize=11.5)
    axis.set_xlim(0, 100)
    axis.set_xticks(range(0, 101, 25))
    axis.set_xticklabels([f"{tick}%" for tick in range(0, 101, 25)], fontsize=10)
    axis.set_ylim(min(y_positions) - 0.92, max(y_positions) + 0.62)
    axis.spines[["top", "right", "left"]].set_visible(False)
    axis.tick_params(axis="y", length=0)

    # Title block: title, subtitle, and legend on separate, well-spaced lines.
    axis.text(0, 1.155, "Claude Opus 4.8 political-response classifications",
              transform=axis.transAxes, fontsize=17, fontweight="bold", va="bottom")
    axis.text(0, 1.10,
              "Share of responses classified as supporting the left only, both sides, or the right only",
              transform=axis.transAxes, fontsize=11.5, color="#333333", va="bottom")
    handles = [plt.Rectangle((0, 0), 1, 1, color=COLORS[category]) for category in ("left", "both", "right")]
    axis.legend(
        handles,
        [CATEGORY_TITLES[category] for category in ("left", "both", "right")],
        loc="lower left",
        bbox_to_anchor=(0.0, 1.02),
        ncol=3,
        frameon=False,
        fontsize=10.5,
        handlelength=1.2,
        handleheight=1.0,
        columnspacing=1.6,
    )

    figure.text(
        0.055,
        0.018,
        "Claude Opus 4.8 responses · Claude Fable 5 classifications — except the Washington Post Experiment row, "
        "which is one reporter-coded response per topic from the Post's frozen source data.",
        fontsize=8.8,
        color="#555555",
    )

    figure.subplots_adjust(left=0.195, right=0.865, top=0.845, bottom=0.085)
    ASSETS.mkdir(parents=True, exist_ok=True)
    figure.savefig(ASSETS / "topline-results.png", dpi=170)
    figure.savefig(ASSETS / "topline-results.svg")
    print(f"Wrote {ASSETS / 'topline-results.png'} and {ASSETS / 'topline-results.svg'}")


if __name__ == "__main__":
    main()
