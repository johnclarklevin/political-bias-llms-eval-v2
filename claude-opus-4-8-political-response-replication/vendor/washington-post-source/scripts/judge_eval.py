"""
Test LLM-as-judge using topic-specific endpoints to anchor left/right classification.

Dataset: modelslant-responses.json, filtered to rows with highlights.
Ground truth: lean derived from [d:...] / [r:...] markers.
Judge: classifies the stripped response as left, right, or both using the
       topic's specific endpoint positions as anchors.
"""

import json
import os
import re
from pathlib import Path
from inspect_ai import Task, task
from inspect_ai.dataset import Sample
from inspect_ai.model import (
    ChatMessageSystem,
    ChatMessageUser,
    ModelOutput,
    get_model,
)
from inspect_ai.scorer import Metric, Score, Scorer, SampleScore, Target, accuracy, metric, scorer
from inspect_ai.solver import Solver, TaskState, solver
from llm_judge import JUDGE_SYSTEM, LEAN_LABELS, judge_prompt, load_endpoints
from model_slant_eval import strip_highlights

RESPONSES_FILE = (
    Path(__file__).parent.parent / "data" / "clean" / "modelslant-responses.json"
)



def lean_from_highlights(text):
    has_left = "[d:" in text
    has_right = "[r:" in text
    if has_left and has_right:
        return "both"
    if has_left:
        return "left"
    if has_right:
        return "right"
    return "none"


def load_dataset(endpoints):
    with open(RESPONSES_FILE) as f:
        rows = json.load(f)

    seen = set()
    samples = []
    for row in rows:
        topic = row.get("topic", "")
        if topic not in endpoints:
            continue
        response = row.get("response") or ""
        lean = lean_from_highlights(response)
        if lean == "none":
            continue
        plain = strip_highlights(response)
        if plain in seen:
            continue
        seen.add(plain)
        samples.append(
            Sample(
                input=row["prompt"],
                target=lean,
                metadata={
                    "response": plain,
                    "model": row["model"],
                    "topic": topic,
                    "endpoints": endpoints[topic],
                },
            )
        )

    return samples


@solver
def use_existing_response() -> Solver:
    async def solve(state: TaskState, generate) -> TaskState:
        response = state.metadata["response"]
        state.output = ModelOutput.from_content(model="manual", content=response)
        return state

    return solve


def _gt(s: SampleScore) -> str:
    m = re.search(r"ground_truth=(\w+)", s.score.explanation or "")
    return m.group(1) if m else ""


@metric
def precision_left() -> Metric:
    def compute(scores: list[SampleScore]) -> float:
        predicted = [s for s in scores if s.score.answer == "left"]
        if not predicted:
            return 0.0
        return sum(1 for s in predicted if _gt(s) == "left") / len(predicted)
    return compute


@metric
def recall_left() -> Metric:
    def compute(scores: list[SampleScore]) -> float:
        actual = [s for s in scores if _gt(s) == "left"]
        if not actual:
            return 0.0
        return sum(1 for s in actual if s.score.answer == "left") / len(actual)
    return compute


@metric
def precision_right() -> Metric:
    def compute(scores: list[SampleScore]) -> float:
        predicted = [s for s in scores if s.score.answer == "right"]
        if not predicted:
            return 0.0
        return sum(1 for s in predicted if _gt(s) == "right") / len(predicted)
    return compute


@metric
def recall_right() -> Metric:
    def compute(scores: list[SampleScore]) -> float:
        actual = [s for s in scores if _gt(s) == "right"]
        if not actual:
            return 0.0
        return sum(1 for s in actual if s.score.answer == "right") / len(actual)
    return compute


@metric
def precision_both() -> Metric:
    def compute(scores: list[SampleScore]) -> float:
        predicted = [s for s in scores if s.score.answer == "both"]
        if not predicted:
            return 0.0
        return sum(1 for s in predicted if _gt(s) == "both") / len(predicted)
    return compute


@metric
def recall_both() -> Metric:
    def compute(scores: list[SampleScore]) -> float:
        actual = [s for s in scores if _gt(s) == "both"]
        if not actual:
            return 0.0
        return sum(1 for s in actual if s.score.answer == "both") / len(actual)
    return compute


@scorer(metrics=[
    accuracy(),
    precision_left(), recall_left(),
    precision_right(), recall_right(),
    precision_both(), recall_both(),
])
def llm_judge(model: str = "openai/gpt-oss-20b", base_url: str = "", api_key: str = "") -> Scorer:
    # Fall back to env vars so a locally-hosted judge can be configured without
    # committing host details. Leave unset to use the provider's default API.
    base_url = base_url or os.environ.get("JUDGE_BASE_URL", "")
    api_key = api_key or os.environ.get("JUDGE_API_KEY", "")
    kwargs = {}
    if base_url:
        kwargs["base_url"] = base_url
    if api_key:
        kwargs["api_key"] = api_key
    judge = get_model(model, **kwargs)

    async def score(state: TaskState, target: Target) -> Score:
        prompt = judge_prompt(
            prompt=state.input_text,
            endpoints=state.metadata["endpoints"],
            response=state.output.completion,
        )
        output = await judge.generate(
            [ChatMessageSystem(content=JUDGE_SYSTEM), ChatMessageUser(content=prompt)],
            cache=True,
        )
        label = (
            output.completion.strip().lower().split()[0]
            if output.completion.strip()
            else ""
        )
        if label not in ("left", "right", "both"):
            label = ""

        return Score(
            value=1 if label == target.text else 0,
            answer=label,
            explanation=f"judge={label}  ground_truth={target.text}",
        )

    return score


@task
def judge_eval(model: str = "openai/gpt-oss-20b"):
    endpoints = load_endpoints()
    return Task(
        dataset=load_dataset(endpoints),
        solver=[use_existing_response()],
        scorer=llm_judge(model=model),
    )
