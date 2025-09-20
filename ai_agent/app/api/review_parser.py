import json 
import re 
from typing import List, Dict

def parse_review_response(review_text: str, file_name: str):
    """
    Parse LLM review output to the UI-ready Comments format.
    This function is kept for backward compatibility with single file reviews.

    Expected input may be:
    - a raw JSON array string
    - a JSON array inside a ```json ... ``` code fence
    - a larger text containing a JSON array substring

    Output items schema (per comment):
    {
        "filePath": str,
        "lineStart": int,
        "lineEnd": Optional[int],
        "content": str,
        "codeSnippet": Optional[str],
        "codeSnippetLineStart": Optional[int],
        "severity": str,
        "metadata": Dict,
        "category": str,
    }
    """
    text = (review_text or "").strip()

    review_items: List[Dict] = []

    # Try 1: parse direct JSON
    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            review_items = parsed
    except Exception:
        pass

    # Try 2: fenced JSON
    if not review_items:
        fenced_match = re.search(r"```json\s*(\[.*?\])\s*```", text, flags=re.DOTALL | re.IGNORECASE)
        if fenced_match:
            array_str = fenced_match.group(1)
            try:
                parsed = json.loads(array_str)
                if isinstance(parsed, list):
                    review_items = parsed
            except Exception:
                pass

    # Try 3: first JSON array substring
    if not review_items:
        array_match = re.search(r"\[.*\]", text, flags=re.DOTALL)
        if array_match:
            array_str = array_match.group(0)
            try:
                parsed = json.loads(array_str)
                if isinstance(parsed, list):
                    review_items = parsed
            except Exception:
                pass

    # If still nothing, return empty to avoid posting junk
    if not review_items:
        return []

    comments: List[Dict] = []
    for item in review_items:
        if not isinstance(item, dict):
            continue

        # Get severity and validate it's one of the allowed values
        severity = item.get("severity", "Info")
        if severity not in ["Info", "Minor", "Major", "Critical", "Blocker"]:
            severity = "Info"  # Default to Info if invalid severity
        
        category = item.get("category", "Issue")
        line_start = int(item.get("line", item.get("lineStart", 1)) or 1)
        line_end = item.get("lineEnd")
        if isinstance(line_end, str):
            try:
                line_end = int(line_end)
            except Exception:
                line_end = None

        # Build content combining issue and suggestion when available
        if severity == "Critical":
            severity_text = "🛑 **Critical Error** "
        elif severity == "Blocker":
            severity_text = "⛔ **Blocker** "
        elif severity == "Major":
            severity_text = "❗ **Major Issue** "
        elif severity == "Minor":
            severity_text = "⚠️ **Minor Issue** "
        elif severity == "Info":
            severity_text = "ℹ️ **Info** "
        else:
            severity_text = ""

        issue_text = item.get("issue", "")
        suggestion_text = item.get("suggestion", "")
        if issue_text or suggestion_text:
            content = f"## Comment from Pullsight AI: \n\n{severity_text}\n\n\n**Issue**: {issue_text}\n\n**Suggestion**: {suggestion_text}".strip()
        else:
            # Fallback: stringify the whole item
            content = json.dumps(item, ensure_ascii=False)

        comment: Dict = {
            "filePath": file_name,
            "lineStart": line_start,
            "lineEnd": line_end if isinstance(line_end, int) else None,
            "content": content,
            "codeSnippet": item.get("codeSnippet"),
            "codeSnippetLineStart": item.get("codeSnippetLineStart"),
            "severity": severity,
            "metadata": item.get("metadata", {}),
            "category": category,
        }

        comments.append(comment)

    return comments

def parse_chunked_review_response(review_text: str, chunk_files: List[Dict], minSeverity: str) -> List[Dict]:
    """
    Parse LLM review output for a chunk of files to the UI-ready Comments format.
    
    Args:
        review_text (str): The LLM review response text
        chunk_files (List[Dict]): List of files in the chunk with their metadata
        minSeverity (str): The minimum severity to comment on
    Returns:
        List[Dict]: List of comments ready for the UI
    """
    text = (review_text or "").strip()

    review_items: List[Dict] = []

    # Try 1: parse direct JSON
    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            review_items = parsed
    except Exception:
        pass

    # Try 2: fenced JSON
    if not review_items:
        fenced_match = re.search(r"```json\s*(\[.*?\])\s*```", text, flags=re.DOTALL | re.IGNORECASE)
        if fenced_match:
            array_str = fenced_match.group(1)
            try:
                parsed = json.loads(array_str)
                if isinstance(parsed, list):
                    review_items = parsed
            except Exception:
                pass

    # Try 3: first JSON array substring
    if not review_items:
        array_match = re.search(r"\[.*\]", text, flags=re.DOTALL)
        if array_match:
            array_str = array_match.group(0)
            try:
                parsed = json.loads(array_str)
                if isinstance(parsed, list):
                    review_items = parsed
            except Exception:
                pass

    # If still nothing, return empty to avoid posting junk
    if not review_items:
        return []

    comments: List[Dict] = []
    
    # Create a mapping of file names to their content for validation
    file_mapping = {file_info["prFileName"]: file_info for file_info in chunk_files}
    
    for item in review_items:
        if not isinstance(item, dict):
            continue

        # only comment on issues with severity greater than or equal to the minSeverity
        severity_levels = ["Info", "Minor", "Major", "Critical", "Blocker"]
        severity_levels_lower = [level.lower() for level in severity_levels]
        severity_index = severity_levels_lower.index(minSeverity.lower())
        
        # Get the severity from the item and convert to lowercase for comparison
        item_severity_lower = item.get("severity", "Info").lower()
        
        # Check if the severity exists in our levels, if not default to "info"
        if item_severity_lower not in severity_levels_lower:
            item_severity_lower = "info"
            
        if severity_levels_lower.index(item_severity_lower) < severity_index:
            continue

        # Convert back to proper case for the final severity
        severity = severity_levels[severity_levels_lower.index(item_severity_lower)]
        
        category = item.get("category", "Issue")
        line_start = int(item.get("line", item.get("lineStart", 1)) or 1)
        line_end = item.get("lineEnd")
        if isinstance(line_end, str):
            try:
                line_end = int(line_end)
            except Exception:
                line_end = None

        # Get the file name from the LLM response
        target_file = item.get("fileName")
        
        # Validate that the file name exists in our chunk
        if not target_file or target_file not in file_mapping:
            # Skip this comment if file name is invalid or missing
            continue

        # Build content combining issue and suggestion when available
        if severity == "Critical":
            severity_text = "🛑 **Critical Error** "
        elif severity == "Blocker":
            severity_text = "🚫 **Blocker** "
        elif severity == "Major":
            severity_text = "⚠️ **Major Issue** "
        elif severity == "Minor":
            severity_text = "⚠️ **Minor Issue** "
        elif severity == "Info":
            severity_text = "ℹ️ **Info** "
        else:
            severity_text = ""

        issue_text = item.get("issue", "")
        suggestion_text = item.get("suggestion", "")
        if issue_text or suggestion_text:
            content = f"## Comment from Pullsight AI: \n\n{severity_text}\n\n\n**Issue**: {issue_text}\n\n**Suggestion**: {suggestion_text}".strip()
        else:
            # Fallback: stringify the whole item
            content = json.dumps(item, ensure_ascii=False)

        comment: Dict = {
            "filePath": target_file,
            "lineStart": line_start,
            "lineEnd": line_end if isinstance(line_end, int) else None,
            "content": content,
            "codeSnippet": item.get("codeSnippet"),
            "codeSnippetLineStart": item.get("codeSnippetLineStart"),
            "severity": severity,
            "metadata": item.get("metadata", {}),
            "category": category,
        }

        comments.append(comment)

    return comments