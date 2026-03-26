"""
Content spinner — rewrites blog content using Claude API for uniqueness and SEO.
"""

import anthropic
from config import Config


def spin_content(
    title: str,
    body_text: str,
    target_keywords: list[str] | None = None,
    tone: str = "professional",
    spin_intensity: str = "medium",
) -> dict:
    """
    Spin/rewrite blog content for SEO uniqueness.

    Args:
        title: Original blog title.
        body_text: Original blog body text.
        target_keywords: Optional list of SEO keywords to weave in.
        tone: Writing tone (professional, casual, authoritative, friendly).
        spin_intensity: How much to rewrite — light, medium, or heavy.

    Returns:
        Dict with keys: title, body_html, excerpt, keywords_used
    """
    Config.validate_anthropic()
    client = anthropic.Anthropic(api_key=Config.ANTHROPIC_API_KEY)

    intensity_instructions = {
        "light": (
            "Lightly rewrite the content: improve wording, fix grammar, "
            "enhance readability, but keep the same structure and key phrases."
        ),
        "medium": (
            "Moderately rewrite the content: restructure sentences, use synonyms, "
            "change paragraph order where it makes sense, but preserve all key "
            "information and the overall message."
        ),
        "heavy": (
            "Heavily rewrite the content: completely restructure the article, "
            "rewrite every sentence from scratch, change the angle/approach, "
            "but preserve all factual information and key points."
        ),
    }

    keywords_section = ""
    if target_keywords:
        kw_list = ", ".join(target_keywords)
        keywords_section = f"""
TARGET KEYWORDS (naturally weave these into the content):
{kw_list}

Ensure keywords appear in headings, first paragraph, and throughout the body
at a natural density (1-2% keyword density). Do not keyword-stuff.
"""

    prompt = f"""You are an expert SEO content writer and blog editor.

TASK: Rewrite the following blog post for maximum SEO impact and uniqueness.

SPIN INTENSITY: {spin_intensity.upper()}
{intensity_instructions.get(spin_intensity, intensity_instructions["medium"])}

TONE: {tone}

{keywords_section}

REQUIREMENTS:
1. Create a compelling, click-worthy title (H1) that includes the primary keyword
2. Use proper heading hierarchy (H2, H3) throughout the article
3. Write a strong opening paragraph that hooks the reader and contains the primary keyword
4. Break content into scannable sections with descriptive subheadings
5. Include a compelling conclusion with a call to action
6. Write a 150-160 character meta description excerpt
7. Output the body in clean HTML format (use h2, h3, p, ul, li, strong, em tags)
8. Make the content 100% unique from the original while preserving all facts
9. Aim for a Flesch reading score of 60-70 (easily readable)

ORIGINAL TITLE:
{title}

ORIGINAL CONTENT:
{body_text}

Respond in this exact JSON format:
{{
    "title": "The new SEO-optimized title",
    "body_html": "<h2>...</h2><p>...</p>...",
    "excerpt": "150-160 char meta description",
    "keywords_used": ["keyword1", "keyword2", ...]
}}

Return ONLY the JSON, no other text."""

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )

    import json

    response_text = message.content[0].text.strip()
    # Handle potential markdown code fences in response
    if response_text.startswith("```"):
        response_text = response_text.split("\n", 1)[1]
        if response_text.endswith("```"):
            response_text = response_text[:-3].strip()

    return json.loads(response_text)


def spin_for_additional_site(
    original_title: str,
    original_body: str,
    target_site_name: str,
    target_site_url: str,
    target_keywords: list[str] | None = None,
    tone: str = "professional",
) -> dict:
    """
    Create a uniquely spun version of already-spun content for a DIFFERENT website.

    This ensures each site gets 100% unique content to avoid duplicate content
    penalties from search engines.

    Args:
        original_title: The title (can be original or already-spun).
        original_body: The body text (can be original or already-spun).
        target_site_name: Name of the website this version is for.
        target_site_url: URL of the target website.
        target_keywords: SEO keywords for this specific site.
        tone: Writing tone.

    Returns:
        Dict with: title, body_html, excerpt, keywords_used, target_site
    """
    Config.validate_anthropic()
    client = anthropic.Anthropic(api_key=Config.ANTHROPIC_API_KEY)

    keywords_section = ""
    if target_keywords:
        kw_list = ", ".join(target_keywords)
        keywords_section = f"""
TARGET KEYWORDS for {target_site_name}:
{kw_list}
"""

    prompt = f"""You are an expert SEO content writer.

TASK: Create a COMPLETELY UNIQUE version of this blog post for the website "{target_site_name}" ({target_site_url}).

This content MUST be 100% different from the source material in wording, structure,
and approach — while covering the same topic and facts. Search engines must see these
as two completely separate articles.

{keywords_section}

TONE: {tone}

REQUIREMENTS:
1. Completely different title, structure, and wording from the original
2. Different heading structure and paragraph organization
3. Same factual content but presented from a different angle
4. Proper SEO heading hierarchy (H2, H3)
5. Strong opening paragraph with primary keyword
6. Output in clean HTML format
7. Include 150-160 char meta description
8. Natural keyword integration (1-2% density)

SOURCE TITLE:
{original_title}

SOURCE CONTENT:
{original_body}

Respond in this exact JSON format:
{{
    "title": "Unique title for {target_site_name}",
    "body_html": "<h2>...</h2><p>...</p>...",
    "excerpt": "150-160 char meta description",
    "keywords_used": ["keyword1", "keyword2", ...],
    "target_site": "{target_site_name}"
}}

Return ONLY the JSON, no other text."""

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )

    import json

    response_text = message.content[0].text.strip()
    if response_text.startswith("```"):
        response_text = response_text.split("\n", 1)[1]
        if response_text.endswith("```"):
            response_text = response_text[:-3].strip()

    return json.loads(response_text)
