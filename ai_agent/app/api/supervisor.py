from fastapi import APIRouter, Request, BackgroundTasks
from app.models.pr_event import PRPayloadV2, PRFileInfo
from app.api.summary import generate_summary_response
from app.api.review import generate_review_response, generate_chunked_review_response
from app.services.claude_service import ClaudeService
from app.utils.chunking_strategy import create_summary_chunks, create_review_chunks, prepare_chunk_for_summary, prepare_chunk_for_review, convert_hunks_to_unified_diff
from app.utils.summary_aggregator import aggregate_chunk_summaries
from app.utils.line_perser import extract_summary_info
import httpx
import os
import json
import re
from app.api.review_parser import parse_review_response, parse_chunked_review_response
from typing import Literal
from dotenv import load_dotenv
import logging
import time
from logging.handlers import RotatingFileHandler
from app.utils.filter_files import filter_pr_files

load_dotenv()

# Configure logger
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Create logs directory if it doesn't exist
log_dir = "logs"
os.makedirs(log_dir, exist_ok=True)

# Create formatter
formatter = logging.Formatter(
    '%(asctime)s - %(name)s - %(levelname)s - %(funcName)s:%(lineno)d - %(message)s'
)

# Create file handler with rotation (10MB max, keep 5 files)
file_handler = RotatingFileHandler(
    filename=os.path.join(log_dir, 'supervisor.log'),
    maxBytes=10 * 1024 * 1024,  # 10MB
    backupCount=5,
    encoding='utf-8'
)
file_handler.setLevel(logging.INFO)
file_handler.setFormatter(formatter)

# Create console handler
console_handler = logging.StreamHandler()
console_handler.setLevel(logging.INFO)
console_handler.setFormatter(formatter)

# Add handlers to logger if not already added
if not logger.handlers:
    logger.addHandler(file_handler)
    logger.addHandler(console_handler)

supervisor = APIRouter(prefix="", tags=["Supervisor"])

# Get backend base URL from environment variable
BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "http://backend")
BACKEND_REVIEW_ENDPOINT = os.getenv("BACKEND_REVIEW_ENDPOINT", "http://backend/reviews")
BACKEND_SUMMARY_ENDPOINT = os.getenv("BACKEND_SUMMARY_ENDPOINT", "http://backend/summary")

def get_backend_url(provider: str, endpoint: Literal["summary", "reviews"]) -> str:
    provider = provider.lower()
    if provider not in ["github", "gitlab", "bitbucket"]:
        provider = "github"  # Default fallback
    return f"{BACKEND_BASE_URL}/v1/{provider}/{endpoint}"

def validate_pr_payload(payload: PRPayloadV2) -> tuple[bool, str, dict]:
    """
    Validate the PR payload format and extract essential data.
    Returns: (is_valid, error_message, extracted_data)
    """
    try:
        pr = payload.pullRequest
        if not pr:
            return False, "No pullRequest data in payload", {}
        
        # Check required fields
        required_fields = ["prNumber", "prTitle"]
        missing_fields = [field for field in required_fields if not pr.get(field)]
        if missing_fields:
            return False, f"Missing required fields: {', '.join(missing_fields)}", {}
        
        api_key = pr.get("apiKey")
        if api_key is None or api_key.strip() == "":
            api_key = None

        model_name = pr.get("modelName")
        if model_name is None or model_name.strip() == "":
            model_name = None

        pr_file_names = []
        ignored_files = pr.get("ignore", [])
        for file in pr.get("prFiles", []):
            pr_file_names.append(file.get("prFileName"))

        logger.info(f"Ignored files: {ignored_files}")
        logger.info(f"PR file names: {pr_file_names}")

        pr_files_allowed = filter_pr_files(ignored_files, pr_file_names)
        pr_files = []
        for file in pr.get("prFiles", []):
            if file.get("prFileName") in pr_files_allowed:
                pr_files.append(file)

        #converting hunks to unified diff
        for file in pr_files:
            # check if prFileDiffHunks exists and is not empty
            if "prFileDiffHunks" not in file or not file.get("prFileDiffHunks"):
                continue
            file["prFileDiff"] = convert_hunks_to_unified_diff(file["prFileDiffHunks"], file["prFileName"])

        
        # Extract and validate data
        extracted_data = {
            "provider": pr.get("provider", "unknown"),
            "installation_id": pr.get("installationId", "0"),
            "pullRequestAnalysisId": pr.get("pullRequestAnalysisId", "0"),
            "number_of_files": pr.get("prFilesChanged", 0),
            "prNumber": pr["prNumber"],
            "prTitle": pr["prTitle"],
            "prBody": pr.get("prBody", ""),
            "author_name": pr.get("prUser", ""),
            "repo_structure_summary": pr.get("prRepoName", ""),
            "prFiles": pr_files,
            "api_key": api_key,
            "model_name": model_name,
            "minSeverity": pr.get("minSeverity", "Major")

        }
        
        # Validate prFiles structure if present
        if extracted_data["prFiles"] and not isinstance(extracted_data["prFiles"], list):
            return False, "prFiles must be a list", {}
        
        # Check if files have required structure
        for i, file_info in enumerate(extracted_data["prFiles"]):
            if not isinstance(file_info, dict):
                return False, f"File {i} is not a valid object", {}
            if "prFileName" not in file_info:
                return False, f"File {i} missing prFileName", {}
            if "prFileDiff" not in file_info and "prFileDiffHunks" not in file_info:
                return False, f"File {i} missing both prFileDiff and prFileDiffHunks", {}
        
        logger.info(f"Payload validation successful. PR: {extracted_data['prNumber']}, Files: {len(extracted_data['prFiles'])}")
        return True, "", extracted_data
        
    except Exception as e:
        logger.error(f"Payload validation failed with exception: {str(e)}")
        return False, f"Payload validation error: {str(e)}", {}

async def process_pr_review_background(extracted_data: dict):
    """
    Background task to process PR review after responding to the client.
    """
    start_time = time.time()
    
    # Initialize token counters for summary and review separately
    summary_input_tokens = 0
    summary_output_tokens = 0
    review_input_tokens = 0
    review_output_tokens = 0
    model_info = ""
    summary_info = {}
    
    logger.info("=" * 80)
    logger.info("Starting background PR review process")
    logger.info(f"PR Details: Number={extracted_data['prNumber']}, Title={extracted_data['prTitle'][:50]}...")
    logger.info(f"Configuration: Provider={extracted_data['provider']}, InstallationId={extracted_data['installation_id']}, AnalysisId={extracted_data['pullRequestAnalysisId']}")
    logger.info(f"Files to process: {extracted_data['number_of_files']}")
    
    llm_service = ClaudeService(api_key=extracted_data.get("api_key"), model_name=extracted_data.get("model_name"))
    
    # Prepare summary generation with chunking strategy
    if extracted_data["prFiles"]:
        logger.info(f"Processing {len(extracted_data['prFiles'])} files for summary generation with chunking strategy")
        
        # Create chunks for summary generation
        chunks, ignored_files = create_summary_chunks(
            files=extracted_data["prFiles"],
            max_chunk_tokens=150000,  # LLM limit
            max_file_tokens=100000    # File size limit
        )
        
        if ignored_files:
            logger.warning(f"Ignored {len(ignored_files)} files for summary due to size limits")
            for ignored in ignored_files:
                logger.warning(f"  - {ignored['fileName']}: {ignored['reason']}")
        
        # Generate summaries for each chunk
        chunk_summaries = []
        total_time_estimation = 0
        total_issue_count = 0
        
        for chunk in chunks:
            logger.info(f"Generating summary for chunk {chunk['chunk_index'] + 1}/{len(chunks)} with {len(chunk['files'])} files")
            
            # Prepare chunk variables
            chunk_variables = prepare_chunk_for_summary(chunk, extracted_data)
            
            try:
                chunk_summary = await generate_summary_response(chunk_variables, llm_service)
                summary_usage = chunk_summary.summary_usage or {}
                logger.info(f"Chunk summary usage: {summary_usage}")
                model_info = chunk_summary.model_info or ""
                chunk_summaries.append(chunk_summary)
                summary_info = extract_summary_info(chunk_summary.pr_summary)
                logger.info(f"Summary info: {summary_info}")
                total_time_estimation += summary_info["estimated_code_review_time"]
                total_issue_count += summary_info["potential_issue_count"]
                summary_input_tokens += summary_usage["input_tokens"]
                summary_output_tokens += summary_usage["output_tokens"]
                logger.info(f"Successfully generated summary for chunk {chunk['chunk_index'] + 1}")
            except Exception as e:
                logger.error(f"Failed to generate summary for chunk {chunk['chunk_index'] + 1}: {str(e)}")
                # Continue with other chunks
                continue
        summary_info = {
            "estimated_code_review_time": total_time_estimation,
            "potential_issue_count": total_issue_count
        }
        logger.info(f"Total estimated code review time: {total_time_estimation} minutes")
        logger.info(f"Total potential issue count: {total_issue_count}")
        
        
        # Aggregate chunk summaries if multiple chunks
        if len(chunk_summaries) > 1:
            logger.info(f"Aggregating {len(chunk_summaries)} chunk summaries")
            try:
                
                aggregated_summary, summary_usage, model_info = await aggregate_chunk_summaries(chunk_summaries, extracted_data, llm_service, summary_info)
                summary_info = extract_summary_info(aggregated_summary)
                summary_input_tokens += summary_usage["input_tokens"]
                summary_output_tokens += summary_usage["output_tokens"]
                logger.info(f"Summary info: {summary_info}")
                summary = type('Summary', (), {'pr_summary': aggregated_summary})()
                logger.info("Successfully aggregated chunk summaries")
            except Exception as e:
                logger.error(f"Failed to aggregate summaries: {str(e)}")
                # Fallback to first chunk summary
                summary = type('Summary', (), {'pr_summary': chunk_summaries[0].pr_summary if chunk_summaries else ""})()
        elif len(chunk_summaries) == 1:
            summary = type('Summary', (), {'pr_summary': chunk_summaries[0].pr_summary})()
        else:
            logger.error("No summaries generated from any chunks")
            return
        
        # Prepare changed files list for backward compatibility
        changed_files = []
        for chunk in chunks:
            for file_info in chunk["files"]:
                changed_files.append(file_info["prFileName"])
        
        logger.info(f"Summary generation completed. Processed {len(changed_files)} files in {len(chunks)} chunks")
        
    else:
        logger.warning("No prFiles found in payload")
        summary = type('Summary', (), {'pr_summary': ""})()
        changed_files = []
    
    # Log summary generation completion
    logger.info("PR summary generation completed successfully")

    summary_usage = {
            "input_tokens": summary_input_tokens,
            "output_tokens": summary_output_tokens
        }
    logger.info(f"Total summary usage: {summary_usage}")
    # Post summary to backend
    logger.info("Posting summary to backend...")
    model_information = {"model_name": model_info} if model_info else {}
    async with httpx.AsyncClient() as client:
        summary_payload = {
            "pullRequestAnalysisId": extracted_data["pullRequestAnalysisId"],
            "summary": summary.pr_summary,
            "modelInfo": model_information,
            "usageInfo": summary_usage,
            "summary_info": summary_info,
            
        }

        try:
            summary_post_start = time.time()
            response = await client.post(BACKEND_SUMMARY_ENDPOINT, json=summary_payload)
            summary_post_duration = time.time() - summary_post_start
            
            if response.status_code == 200:
                logger.info(f"Summary posted to backend successfully in {summary_post_duration:.2f}s")
            else:
                # Truncate response for cleaner logs
                response_text = response.text[:200] + "..." if len(response.text) > 200 else response.text
                logger.error(f"Failed to post summary. Status: {response.status_code}, Response: {response_text}")
        except Exception as e:
            logger.error(f"Exception while posting summary: {str(e)}")

    # Process reviews using chunking strategy
    logger.info("Starting review generation process with chunking strategy...")

    async with httpx.AsyncClient() as client:
        if extracted_data["prFiles"]:
            # Create chunks for review generation
            review_chunks, ignored_review_files = create_review_chunks(
                files=extracted_data["prFiles"],
                max_chunk_tokens=150000,  # LLM limit for reviews
                max_file_tokens=100000    # File size limit
            )
            
            if ignored_review_files:
                logger.warning(f"Ignored {len(ignored_review_files)} files for review due to size limits")
                for ignored in ignored_review_files:
                    logger.warning(f"  - {ignored['fileName']}: {ignored['reason']}")
            
            total_chunks = len(review_chunks)
            logger.info(f"Processing {extracted_data['number_of_files']} files in {total_chunks} review chunks")
            
            all_comments = []
            
            for chunk_index, chunk in enumerate(review_chunks):
                chunk_start_time = time.time()
                logger.info(f"Processing review chunk {chunk_index + 1}/{total_chunks} with {len(chunk['files'])} files")
                
                try:
                    # Prepare chunk variables for review
                    chunk_variables = prepare_chunk_for_review(chunk, extracted_data)
                    
                    logger.info(f"Generating review for chunk {chunk_index + 1} with LLM...")
                    llm_start_time = time.time()
                    review = await generate_chunked_review_response(chunk_variables, llm_service)
                    review_usage = review.review_usage or {}
                    review_input_tokens += review_usage.get("input_tokens", 0)
                    review_output_tokens += review_usage.get("output_tokens", 0)
                    logger.info(f"Review usage for chunk {chunk_index + 1}: {review_usage}")
                    model_info = review.model_info or ""
                    llm_duration = time.time() - llm_start_time
                    logger.info(f"LLM review generated for chunk {chunk_index + 1} in {llm_duration:.2f}s")
                    
                    logger.info(f"Parsing review response for chunk {chunk_index + 1}...")
                    parse_start_time = time.time()
                    chunk_comments = parse_chunked_review_response(review.pr_review_and_suggestion, chunk["files"],minSeverity=extracted_data["minSeverity"])
                    parse_duration = time.time() - parse_start_time
                    
                    logger.info(f"Parsed {len(chunk_comments)} comments for chunk {chunk_index + 1} in {parse_duration:.2f}s")
                    all_comments.extend(chunk_comments)
                    
                    chunk_duration = time.time() - chunk_start_time
                    logger.info(f"Completed processing review chunk {chunk_index + 1} in {chunk_duration:.2f}s")

                    review_usage = {
                        "input_tokens": review_input_tokens,
                        "output_tokens": review_output_tokens
                    }

                    logger.info(f"Total review usage: {review_usage}")
                    logger.info(f"Total comments generated: {len(all_comments)}")

                    model_information = {"model_name": model_info} if model_info else {}
                    
                    # Post this chunk's comments immediately
                    review_payload = {
                        "pullRequestAnalysisId": extracted_data["pullRequestAnalysisId"],
                        "comments": chunk_comments,
                        "modelInfo": {"model_name": model_info} if model_info else {},
                        "usageInfo": review_usage,
                        "completed": 1 if chunk_index == total_chunks - 1 else 0
                    }

                    logger.info(f"Posting {len(chunk_comments)} comments for chunk {chunk_index + 1} to backend...")

                    try:
                        post_start_time = time.time()
                        response = await client.post(BACKEND_REVIEW_ENDPOINT, json=review_payload)
                        post_duration = time.time() - post_start_time
                        
                        if response.status_code == 200:
                            logger.info(f"Review comments for chunk {chunk_index + 1} posted successfully in {post_duration:.2f}s")
                        else:
                            # Truncate response for cleaner logs
                            response_text = response.text[:200] + "..." if len(response.text) > 200 else response.text
                            logger.error(f"Failed to post review comments for chunk {chunk_index + 1}. Status: {response.status_code}, Response: {response_text}")
                    
                    except Exception as e:
                        logger.error(f"Exception while posting review comments: {str(e)}")

                    post_duration = time.time() - post_start_time
        
                except Exception as e:
                    logger.error(f"Failed to process review chunk {chunk_index + 1}: {str(e)}")
                    continue
        else:
            logger.warning("No prFiles found for review processing")

    total_duration = time.time() - start_time
    logger.info(f"Background PR review process completed successfully in {total_duration:.2f}s")
    logger.info("=" * 80)


    

@supervisor.post("/ai_agent")
async def supervisor_pr_review(payload: PRPayloadV2, background_tasks: BackgroundTasks):
    """
    AI Agent endpoint for PR review processing.
    Validates input, responds immediately, then processes in background.
    """
    logger.info("Received PR review request")
    
    # Validate payload format
    is_valid, error_message, extracted_data = validate_pr_payload(payload)
    
    if not is_valid:
        logger.error(f"Payload validation failed: {error_message}")
        return {
            "status": "error", 
            "message": f"Invalid payload format: {error_message}"
        }
    
    # Log successful validation
    logger.info(f"Payload validation successful for PR #{extracted_data['prNumber']}")
    logger.info(f"Scheduling background processing for {extracted_data['number_of_files']} files")
    
    # Add background task for processing
    background_tasks.add_task(process_pr_review_background, extracted_data)
    
    # Return immediate response
    logger.info("Sending immediate response: Data received, review in progress")
    return {
        "status": "accepted",
        "message": "Data received, review in progress",
        "pullRequestAnalysisId": extracted_data["pullRequestAnalysisId"],
        "prNumber": extracted_data["prNumber"],
        "filesCount": extracted_data["number_of_files"]
    }
