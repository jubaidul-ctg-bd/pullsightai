from app.models.pr_response import PRSummaryResponse
import yaml
import os

PROMPT_PATH = os.path.join(os.path.dirname(__file__), '../../config/prompt.yaml')

def load_prompt():
    with open(PROMPT_PATH, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f)

def fill_prompt(template: str, variables: dict) -> str:
    return template.format(**variables)

async def generate_summary_response(variables: dict, llm_service) -> PRSummaryResponse:
    prompt_yaml = load_prompt()
    prompt = fill_prompt(prompt_yaml['summary'], variables)
    summary, summary_usage, model_info = await llm_service.generate_pr_summary(prompt)
    return PRSummaryResponse(prNumber=variables.get('prNumber', "0"), pr_line=1, pr_summary=summary, summary_usage=summary_usage, model_info=model_info) 