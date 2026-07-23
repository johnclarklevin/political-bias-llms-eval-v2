from inspect_ai import Task, task
from inspect_ai.dataset import Sample
from inspect_ai.solver import generate, system_message
from model_slant_eval import SYSTEM_PROMPT, load_dataset as _load_topics
from llm_judge import llm_judge, load_endpoints


def load_dataset():
    endpoints = load_endpoints()
    return [
        Sample(
            input=s.input,
            metadata={**s.metadata, "endpoints": endpoints[s.metadata["topic"]]},
        )
        for s in _load_topics()
        if s.metadata.get("topic") in endpoints
    ]


dataset = load_dataset()


@task
def variance_eval(judge_model: str = "openai/gpt-oss-20b"):
    return Task(
        dataset=dataset,
        solver=[
            system_message(SYSTEM_PROMPT),
            generate(),
        ],
        scorer=llm_judge(model=judge_model),
    )
