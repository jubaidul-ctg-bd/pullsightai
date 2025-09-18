import json
import logging
from typing import List, Dict, Tuple
from .token_counter import estimate_tokens_for_file, is_file_too_large

logger = logging.getLogger(__name__)

def sort_files_by_path(files: List[Dict]) -> List[Dict]:
    """
    Sort files by their path/filename alphabetically to group files from the same folder.
    
    Args:
        files (List[Dict]): List of file dictionaries with 'prFileName' key
    
    Returns:
        List[Dict]: Sorted list of files
    """
    return sorted(files, key=lambda x: x["prFileName"])

def create_chunks_for_review(files: List[Dict], max_chunk_tokens: int = 150000, max_file_tokens: int = 100000) -> List[Dict]:
    """
    Create chunks of files for both summary and review generation based on token limits.
    
    Args:
        files (List[Dict]): List of file dictionaries
        max_chunk_tokens (int): Maximum tokens per chunk (default: 150000)
        max_file_tokens (int): Maximum tokens per file (default: 100000)
    
    Returns:
        List[Dict]: List of chunks, each containing files and metadata
    """
    # Sort files by path for better context grouping
    sorted_files = sort_files_by_path(files)
    
    chunks = []
    current_chunk = {
        "files": [],
        "total_tokens": 0,
        "chunk_index": 0
    }
    
    ignored_files = []
    
    logger.info(f"Starting chunking with max_chunk_tokens={max_chunk_tokens}, max_file_tokens={max_file_tokens}")
    
    for file_info in sorted_files:
        file_name = file_info["prFileName"]
        file_diff = file_info["prFileDiff"]
        pr_file_content_before = file_info["prFileContentBefore"]
        
        # Check if file is too large
        if is_file_too_large(file_diff, max_file_tokens) or is_file_too_large(pr_file_content_before, max_file_tokens):
            logger.warning(f"File {file_name} exceeds {max_file_tokens} tokens, ignoring for processing")
            ignored_files.append({
                "fileName": file_name,
                "reason": f"File exceeds {max_file_tokens} token limit"
            })
            continue

        file_tokens = estimate_tokens_for_file(file_diff) + estimate_tokens_for_file(pr_file_content_before)
        logger.debug(f"Processing file {file_name} with {file_tokens} tokens")
        
        # Check if adding this file would exceed chunk limit
        if current_chunk["total_tokens"] + file_tokens > max_chunk_tokens:
            # Current chunk is full, save it and start a new one
            if current_chunk["files"]:
                chunks.append(current_chunk)
                logger.info(f"Created chunk {current_chunk['chunk_index'] + 1} with {len(current_chunk['files'])} files, {current_chunk['total_tokens']} tokens")
            
            # Start new chunk
            current_chunk = {
                "files": [file_info],
                "total_tokens": file_tokens,
                "chunk_index": len(chunks)
            }
            logger.debug(f"Started new chunk {current_chunk['chunk_index'] + 1} with file {file_name}")
        else:
            # Add file to current chunk
            current_chunk["files"].append(file_info)
            current_chunk["total_tokens"] += file_tokens
            logger.debug(f"Added file {file_name} to chunk {current_chunk['chunk_index'] + 1}, total tokens: {current_chunk['total_tokens']}")
    
    # Add the last chunk if it has files
    if current_chunk["files"]:
        chunks.append(current_chunk)
        logger.info(f"Created final chunk {current_chunk['chunk_index'] + 1} with {len(current_chunk['files'])} files, {current_chunk['total_tokens']} tokens")
    
    # Log summary
    total_files_processed = sum(len(chunk["files"]) for chunk in chunks)
    total_files_ignored = len(ignored_files)
    
    logger.info(f"Chunking complete: {len(chunks)} chunks created")
    logger.info(f"Files processed: {total_files_processed}, Files ignored: {total_files_ignored}")
    
    if ignored_files:
        logger.warning(f"Ignored files: {[f['fileName'] for f in ignored_files]}")
    
    return chunks, ignored_files

def create_chunks_for_summary(files: List[Dict], max_chunk_tokens: int = 150000, max_file_tokens: int = 100000) -> List[Dict]:
    """
    Create chunks of files for both summary and review generation based on token limits.
    
    Args:
        files (List[Dict]): List of file dictionaries
        max_chunk_tokens (int): Maximum tokens per chunk (default: 150000)
        max_file_tokens (int): Maximum tokens per file (default: 100000)
    
    Returns:
        List[Dict]: List of chunks, each containing files and metadata
    """
    # Sort files by path for better context grouping
    sorted_files = sort_files_by_path(files)
    
    chunks = []
    current_chunk = {
        "files": [],
        "total_tokens": 0,
        "chunk_index": 0
    }
    
    ignored_files = []
    
    logger.info(f"Starting chunking with max_chunk_tokens={max_chunk_tokens}, max_file_tokens={max_file_tokens}")
    
    for file_info in sorted_files:
        file_name = file_info["prFileName"]
        file_diff = file_info["prFileDiff"]
        
        
        # Check if file is too large
        if is_file_too_large(file_diff, max_file_tokens):
            logger.warning(f"File {file_name} exceeds {max_file_tokens} tokens, ignoring for processing")
            ignored_files.append({
                "fileName": file_name,
                "reason": f"File exceeds {max_file_tokens} token limit"
            })
            continue

        file_tokens = estimate_tokens_for_file(file_diff)
        logger.debug(f"Processing file {file_name} with {file_tokens} tokens")
        
        # Check if adding this file would exceed chunk limit
        if current_chunk["total_tokens"] + file_tokens > max_chunk_tokens:
            # Current chunk is full, save it and start a new one
            if current_chunk["files"]:
                chunks.append(current_chunk)
                logger.info(f"Created chunk {current_chunk['chunk_index'] + 1} with {len(current_chunk['files'])} files, {current_chunk['total_tokens']} tokens")
            
            # Start new chunk
            current_chunk = {
                "files": [file_info],
                "total_tokens": file_tokens,
                "chunk_index": len(chunks)
            }
            logger.debug(f"Started new chunk {current_chunk['chunk_index'] + 1} with file {file_name}")
        else:
            # Add file to current chunk
            current_chunk["files"].append(file_info)
            current_chunk["total_tokens"] += file_tokens
            logger.debug(f"Added file {file_name} to chunk {current_chunk['chunk_index'] + 1}, total tokens: {current_chunk['total_tokens']}")
    
    # Add the last chunk if it has files
    if current_chunk["files"]:
        chunks.append(current_chunk)
        logger.info(f"Created final chunk {current_chunk['chunk_index'] + 1} with {len(current_chunk['files'])} files, {current_chunk['total_tokens']} tokens")
    
    # Log summary
    total_files_processed = sum(len(chunk["files"]) for chunk in chunks)
    total_files_ignored = len(ignored_files)
    
    logger.info(f"Chunking complete: {len(chunks)} chunks created")
    logger.info(f"Files processed: {total_files_processed}, Files ignored: {total_files_ignored}")
    
    if ignored_files:
        logger.warning(f"Ignored files: {[f['fileName'] for f in ignored_files]}")
    
    return chunks, ignored_files

def create_summary_chunks(files: List[Dict], max_chunk_tokens: int = 200000, max_file_tokens: int = 100000) -> List[Dict]:
    """
    Create chunks of files for summary generation based on token limits.
    This is a wrapper around create_chunks for backward compatibility.
    
    Args:
        files (List[Dict]): List of file dictionaries
        max_chunk_tokens (int): Maximum tokens per chunk (default: 200000)
        max_file_tokens (int): Maximum tokens per file (default: 100000)
    
    Returns:
        List[Dict]: List of chunks, each containing files and metadata
    """
    return create_chunks_for_summary(files, max_chunk_tokens, max_file_tokens)

def create_review_chunks(files: List[Dict], max_chunk_tokens: int = 150000, max_file_tokens: int = 100000) -> List[Dict]:
    """
    Create chunks of files for review generation based on token limits.
    
    Args:
        files (List[Dict]): List of file dictionaries
        max_chunk_tokens (int): Maximum tokens per chunk (default: 150000)
        max_file_tokens (int): Maximum tokens per file (default: 100000)
    
    Returns:
        List[Dict]: List of chunks, each containing files and metadata
    """
    return create_chunks_for_review(files, max_chunk_tokens, max_file_tokens)

def prepare_chunk_for_summary(chunk: Dict, pr_metadata: Dict) -> Dict:
    """
    Prepare a chunk for summary generation by creating the necessary variables.
    
    Args:
        chunk (Dict): Chunk containing files and metadata
        pr_metadata (Dict): PR metadata (title, body, etc.)
    
    Returns:
        Dict: Variables ready for summary generation
    """
    changed_files = []
    pr_diff = ""
    
    for file_info in chunk["files"]:
        changed_files.append(file_info["prFileName"])
        pr_diff += f"\n\n--- File: {file_info['prFileName']} ---\n{file_info['prFileDiff']}"
    
    # Create severity list based on minSeverity (same logic as review)
    severity_list = ["Info", "Minor", "Major", "Critical", "Blocker"]
    min_severity = pr_metadata.get("minSeverity", "Major")
    try:
        min_severity_index = severity_list.index(min_severity)
        filtered_severity_list = severity_list[min_severity_index:]
    except ValueError:
        # If minSeverity is not found, default to Major
        filtered_severity_list = ["Major", "Critical", "Blocker"]
    
    return {
        "prTitle": pr_metadata.get("prTitle", ""),
        "prBody": pr_metadata.get("prBody", ""),
        "author_name": pr_metadata.get("author_name", ""),
        "prNumber": pr_metadata.get("prNumber", ""),
        "api_key": pr_metadata.get("api_key", None),
        "model_name": pr_metadata.get("model_name", "claude-opus-4-1-20250805"),
        "changed_files": ", ".join(changed_files),
        "repo_structure_summary": pr_metadata.get("repo_structure_summary", ""),
        "pr_diff": pr_diff,
        "severity_list": str(filtered_severity_list),
        "chunk_info": f"Chunk {chunk['chunk_index'] + 1} of multiple chunks"
    }

def prepare_chunk_for_review(chunk: Dict, pr_metadata: Dict) -> Dict:
    """
    Prepare a chunk for review generation by creating the necessary variables.
    
    Args:
        chunk (Dict): Chunk containing files and metadata
        pr_metadata (Dict): PR metadata (title, body, etc.)
    
    Returns:
        Dict: Variables ready for review generation
    """
    changed_files = []
    pr_diff_chunk = ""
    pr_file_content_before = ""
    
    for file_info in chunk["files"]:
        from .diff_formatter import format_diff_for_llm
        pr_diff_processed = format_diff_for_llm(file_info["prFileDiffHunks"], file_info["prFileName"])
        pr_diff_chunk += f"\n\n--- File: {file_info['prFileName']} ---\n{pr_diff_processed}"
        changed_files.append(file_info["prFileName"])
        # # Collect file content before changes if available
        if file_info.get("prFileContentBefore"):
            pr_file_content_before += f"\n\n--- File: {file_info['prFileName']} (Before Changes) ---\n{file_info['prFileContentBefore']}"

    #make a severity list with the equal or greater than the minSeverity by indexing the severity_list
    severity_list = ["Info", "Minor", "Major", "Critical", "Blocker"]
    severity_list = [severity for severity in severity_list if severity_list.index(severity) >= severity_list.index(pr_metadata.get("minSeverity", "Major"))]
    
    return {
        "prTitle": pr_metadata.get("prTitle", ""),
        "prBody": pr_metadata.get("prBody", ""),
        "author_name": pr_metadata.get("author_name", ""),
        "prNumber": pr_metadata.get("prNumber", ""),
        "changed_files": ", ".join(changed_files),
        "repo_structure_summary": pr_metadata.get("repo_structure_summary", ""),
        "prFileContentBefore": pr_file_content_before,
        "pr_diff": pr_diff_chunk,
        "severity_list": str(severity_list),
        "chunk_info": f"Chunk {chunk['chunk_index'] + 1} of multiple chunks"
    } 

def convert_hunks_to_unified_diff(hunks: List[str], file_name: str) -> str:
    """
    Convert hunks to unified diff format.
    """
    return "\n".join(hunks)
