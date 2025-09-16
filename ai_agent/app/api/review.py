from app.models.pr_response import PRReviewResponse
import yaml
import os

PROMPT_PATH = os.path.join(os.path.dirname(__file__), '../../config/prompt.yaml')

def load_prompt():
    with open(PROMPT_PATH, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f)

def fill_prompt(template: str, variables: dict) -> str:
    return template.format(**variables)

async def generate_review_response(variables: dict, llm_service) -> PRReviewResponse:
    prompt_yaml = load_prompt()
    prompt = fill_prompt(prompt_yaml['review'], variables)
    review, review_usage, model_info = await llm_service.generate_code_review(prompt)
    return PRReviewResponse(prNumber=str(variables.get('prNumber', "0")), pr_line=1, pr_review_and_suggestion=review, review_usage=review_usage, model_info=model_info)

async def generate_chunked_review_response(chunk_variables: dict, llm_service) -> PRReviewResponse:
    """
    Generate review response for a chunk of files.
    
    Args:
        chunk_variables (dict): Variables prepared for the chunk
        llm_service: LLM service instance
        model_name (str): Model name to use for review generation
    
    Returns:
        PRReviewResponse: Review response for the chunk
    """
    prompt_yaml = load_prompt()
    prompt = fill_prompt(prompt_yaml['review'], chunk_variables)
    review, review_usage, model_info = await llm_service.generate_code_review(prompt)
    return PRReviewResponse(
        prNumber=str(chunk_variables.get('prNumber', "0")), 
        pr_line=1, 
        pr_review_and_suggestion=review, 
        review_usage=review_usage, 
        model_info=model_info
    ) 