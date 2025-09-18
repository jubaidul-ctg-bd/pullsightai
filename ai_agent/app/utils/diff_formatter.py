"""
Git diff formatter for LLM-friendly code review.
Converts raw git diff hunks into a clear, line-numbered format for LLM analysis.
"""

import re
from typing import List, Dict, Tuple, Optional


def parse_diff_hunk(hunk: str) -> Dict:
    """
    Parse a single diff hunk to extract line numbers and content.
    
    Args:
        hunk (str): Raw diff hunk string
        
    Returns:
        Dict: Parsed hunk with line numbers and content
    """
    lines = hunk.split('\n')
    
    # Extract hunk header (e.g., "@@ -0,0 +1,923 @@"")
    header_match = re.match(r'@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@', lines[0])
    if not header_match:
        return {"error": "Invalid hunk header"}
    
    old_start = int(header_match.group(1))
    old_count = int(header_match.group(2)) if header_match.group(2) else 0
    new_start = int(header_match.group(3))
    new_count = int(header_match.group(4)) if header_match.group(4) else 0
    
    # Process content lines
    old_line_num = old_start
    new_line_num = new_start
    old_lines = []
    new_lines = []
    context_lines = []
    
    for line in lines[1:]:
        if line.startswith(' '):
            # Context line (unchanged)
            context_lines.append({
                'old_line': old_line_num,
                'new_line': new_line_num,
                'content': line[1:],  # Remove leading space
                'type': 'context'
            })
            old_line_num += 1
            new_line_num += 1
        elif line.startswith('-'):
            # Deleted line
            old_lines.append({
                'old_line': old_line_num,
                'content': line[1:],  # Remove leading -
                'type': 'deleted'
            })
            old_line_num += 1
        elif line.startswith('+'):
            # Added line
            new_lines.append({
                'new_line': new_line_num,
                'content': line[1:],  # Remove leading +
                'type': 'added'
            })
            new_line_num += 1
    
    return {
        'old_start': old_start,
        'old_count': old_count,
        'new_start': new_start,
        'new_count': new_count,
        'old_lines': old_lines,
        'new_lines': new_lines,
        'context_lines': context_lines
    }


def format_diff_for_llm(diff_hunks: List[str], file_path: str = "") -> str:
    """
    Format git diff hunks into LLM-friendly format with clear line numbers.
    
    Args:
        diff_hunks (List[str]): List of raw diff hunk strings
        file_path (str): Path to the file being reviewed
        
    Returns:
        str: Formatted diff for LLM review
    """
    if not diff_hunks:
        return f"# File: {file_path}\n\nNo changes found in this file.\n"
    
    formatted_output = []
    formatted_output.append(f"# File: {file_path}")
    formatted_output.append("=" * 80)
    formatted_output.append("")
    
    for hunk_index, hunk in enumerate(diff_hunks):
        parsed = parse_diff_hunk(hunk)
        
        if "error" in parsed:
            formatted_output.append(f"## Hunk {hunk_index + 1} - Error")
            formatted_output.append(f"Error: {parsed['error']}")
            formatted_output.append("")
            continue
        
        # Hunk header
        formatted_output.append(f"## Hunk {hunk_index + 1}")
        formatted_output.append(f"**Changes:** Lines {parsed['old_start']}-{parsed['old_start'] + parsed['old_count'] - 1} → {parsed['new_start']}-{parsed['new_start'] + parsed['new_count'] - 1}")
        formatted_output.append("")
        
        # Combine all lines and sort by line number
        all_lines = []
        
        # Add context lines
        for line in parsed['context_lines']:
            all_lines.append({
                'line_num': line['new_line'],
                'content': line['content'],
                'type': 'context',
                'marker': '  '
            })
        
        # Add deleted lines
        for line in parsed['old_lines']:
            all_lines.append({
                'line_num': line['old_line'],
                'content': line['content'],
                'type': 'deleted',
                'marker': '- '
            })
        
        # Add added lines
        for line in parsed['new_lines']:
            all_lines.append({
                'line_num': line['new_line'],
                'content': line['content'],
                'type': 'added',
                'marker': '+ '
            })
        
        # Sort by line number
        all_lines.sort(key=lambda x: x['line_num'])
        
        # Format lines
        formatted_output.append("```diff")
        for line in all_lines:
            line_num = f"{line['line_num']:4d}"
            marker = line['marker']
            content = line['content']
            line_type = line['type']
            
            # Color coding for different types
            if line_type == 'deleted':
                formatted_output.append(f"{line_num} {marker}{content}")
            elif line_type == 'added':
                formatted_output.append(f"{line_num} {marker}{content}")
            else:  # context
                formatted_output.append(f"{line_num} {marker}{content}")
        
        formatted_output.append("```")
        formatted_output.append("")
        
        # Summary of changes in this hunk
        if parsed['old_lines'] or parsed['new_lines']:
            formatted_output.append("**Summary of changes in this hunk:**")
            if parsed['old_lines']:
                formatted_output.append(f"- {len(parsed['old_lines'])} line(s) deleted")
            if parsed['new_lines']:
                formatted_output.append(f"- {len(parsed['new_lines'])} line(s) added")
            formatted_output.append("")
    
    return "\n".join(formatted_output)


def create_llm_review_context(file_path: str, diff_hunks: List[str], file_content_before: str = "") -> str:
    """
    Create a comprehensive context for LLM review including file info, diff, and original content.
    
    Args:
        file_path (str): Path to the file being reviewed
        diff_hunks (List[str]): List of raw diff hunk strings
        file_content_before (str): Original file content before changes
        
    Returns:
        str: Complete context for LLM review
    """
    context_parts = []
    
    # File information
    context_parts.append(f"# Code Review Context")
    context_parts.append(f"**File:** `{file_path}`")
    context_parts.append("")
    
    # Original file content (if provided)
    if file_content_before:
        context_parts.append("## Original File Content (Before Changes)")
        context_parts.append("```")
        context_parts.append(file_content_before)
        context_parts.append("```")
        context_parts.append("")
    
    # Formatted diff
    context_parts.append("## Changes Made (Git Diff)")
    formatted_diff = format_diff_for_llm(diff_hunks, file_path)
    context_parts.append(formatted_diff)
    
    # Review instructions
    context_parts.append("## Review Instructions")
    context_parts.append("Please review the changes above and provide feedback on:")
    context_parts.append("- Code quality and correctness")
    context_parts.append("- Potential bugs or issues")
    context_parts.append("- Security vulnerabilities")
    context_parts.append("- Performance implications")
    context_parts.append("- Code style and best practices")
    context_parts.append("")
    context_parts.append("For each issue found, please specify:")
    context_parts.append("- The exact line number(s) where the issue occurs")
    context_parts.append("- A clear description of the problem")
    context_parts.append("- Suggested fix or improvement")
    
    return "\n".join(context_parts)