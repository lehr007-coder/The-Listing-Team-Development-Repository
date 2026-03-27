"""
SEO Optimizer — generates full SEO metadata package using Claude API.

Produces: meta title, description, Open Graph tags, schema markup,
image alt text, canonical URL suggestions, and keyword analysis.
"""

from __future__ import annotations

import json

import anthropic
from config import Config


def optimize_seo(
    title: str,
    body_html: str,
    images: list[dict],
    target_url: str = "",
    business_name: str = "The Listing Team",
    target_keywords: list[str] | None = None,
) -> dict:
    """
    Generate a complete SEO metadata package for a blog post.

    Args:
        title: Blog post title.
        body_html: Blog post body in HTML.
        images: List of image dicts with 'filename' keys.
        target_url: The URL where this will be published (for canonical).
        business_name: Business/author name.
        target_keywords: Target SEO keywords.

    Returns:
        Dict with: meta_title, meta_description, og_tags, schema_markup,
                   image_alt_texts, header_tags, internal_link_suggestions,
                   keyword_analysis
    """
    Config.validate_anthropic()
    client = anthropic.Anthropic(api_key=Config.ANTHROPIC_API_KEY)

    image_filenames = [img.get("filename", "image") for img in images]
    keywords_text = ", ".join(target_keywords) if target_keywords else "auto-detect"

    prompt = f"""You are an expert SEO specialist. Generate a COMPLETE SEO metadata package for this blog post.

BLOG TITLE: {title}

BLOG CONTENT:
{body_html[:3000]}

IMAGES IN POST: {json.dumps(image_filenames)}
TARGET URL: {target_url or "TBD"}
BUSINESS NAME: {business_name}
TARGET KEYWORDS: {keywords_text}

Generate ALL of the following:

1. **Meta Title** (50-60 chars, include primary keyword)
2. **Meta Description** (150-160 chars, compelling with keyword)
3. **Open Graph Tags** (og:title, og:description, og:type, og:image suggestion)
4. **Twitter Card Tags** (twitter:card, twitter:title, twitter:description)
5. **Schema Markup** (BlogPosting JSON-LD schema — full and valid)
6. **Image Alt Texts** (SEO-optimized alt text for EACH image filename listed)
7. **Header Tag Analysis** (confirm proper H1 > H2 > H3 hierarchy)
8. **Keyword Analysis**:
   - Primary keyword
   - Secondary keywords (3-5)
   - LSI (Latent Semantic Indexing) keywords (5-8)
   - Keyword density recommendation
9. **URL Slug Suggestion** (SEO-friendly URL slug)
10. **Internal Linking Suggestions** (topics to link to for SEO boost)

Respond in this exact JSON format:
{{
    "meta_title": "...",
    "meta_description": "...",
    "og_tags": {{
        "og:title": "...",
        "og:description": "...",
        "og:type": "article",
        "og:image": "first image filename or suggestion"
    }},
    "twitter_tags": {{
        "twitter:card": "summary_large_image",
        "twitter:title": "...",
        "twitter:description": "..."
    }},
    "schema_markup": {{
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "headline": "...",
        "description": "...",
        "author": {{
            "@type": "Organization",
            "name": "{business_name}"
        }},
        "datePublished": "...",
        "image": "..."
    }},
    "image_alt_texts": {{
        "filename1.jpg": "descriptive alt text",
        "filename2.png": "descriptive alt text"
    }},
    "header_hierarchy": ["H1: ...", "H2: ...", "H3: ..."],
    "keyword_analysis": {{
        "primary_keyword": "...",
        "secondary_keywords": ["...", "..."],
        "lsi_keywords": ["...", "..."],
        "recommended_density": "1.5-2%"
    }},
    "url_slug": "seo-friendly-url-slug",
    "internal_link_suggestions": ["topic 1", "topic 2"]
}}

Return ONLY the JSON, no other text."""

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}],
    )

    response_text = message.content[0].text.strip()
    if response_text.startswith("```"):
        response_text = response_text.split("\n", 1)[1]
        if response_text.endswith("```"):
            response_text = response_text[:-3].strip()

    return json.loads(response_text)
