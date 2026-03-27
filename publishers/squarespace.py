"""
Squarespace API publisher — creates blog posts with images and full SEO metadata.

Uses the Squarespace Content API v1.0.
Docs: https://developers.squarespace.com/commerce-apis/overview
"""

from __future__ import annotations

import json
import time

import requests
from config import Config


class SquarespacePublisher:
    """Publish blog posts to Squarespace via their API."""

    BASE_URL = "https://api.squarespace.com/1.0"

    def __init__(self):
        Config.validate_squarespace()
        self.api_key = Config.SQUARESPACE_API_KEY
        self.site_id = Config.SQUARESPACE_SITE_ID
        self.collection_id = Config.SQUARESPACE_BLOG_COLLECTION_ID
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "User-Agent": "BlogAutomation/1.0",
        }

    def _request(self, method: str, endpoint: str, data: dict = None) -> dict:
        """Make an authenticated API request to Squarespace."""
        url = f"{self.BASE_URL}{endpoint}"
        response = requests.request(
            method=method,
            url=url,
            headers=self.headers,
            json=data,
            timeout=30,
        )
        response.raise_for_status()
        return response.json() if response.text else {}

    def upload_image(self, image_data: dict) -> str | None:
        """
        Upload an image to Squarespace.

        Note: Squarespace's API has limited direct image upload support.
        Images are typically embedded as base64 data URIs in the HTML content,
        or uploaded through the storage API.

        Args:
            image_data: Dict with 'bytes', 'mime', 'filename' keys.

        Returns:
            URL of uploaded image or None.
        """
        # Squarespace handles images embedded in HTML content.
        # For direct uploads, we use base64 data URIs in the HTML.
        import base64

        b64 = base64.b64encode(image_data["bytes"]).decode("utf-8")
        return f"data:{image_data['mime']};base64,{b64}"

    def create_blog_post(
        self,
        title: str,
        body_html: str,
        excerpt: str = "",
        slug: str = "",
        seo_data: dict | None = None,
        images: list[dict] | None = None,
        publish: bool = False,
    ) -> dict:
        """
        Create a blog post on Squarespace.

        Args:
            title: Post title.
            body_html: Post body in HTML.
            excerpt: Short excerpt / meta description.
            slug: URL slug.
            seo_data: SEO metadata dict from seo_optimizer.
            images: Processed images list.
            publish: If True, publish immediately. If False, save as draft.

        Returns:
            API response dict with post details.
        """
        # Embed images into the HTML body
        if images:
            body_html = self._embed_images_in_html(body_html, images, seo_data)

        # Build the post payload
        post_data = {
            "type": "BLOG",
            "collectionId": self.collection_id,
            "title": title,
            "body": body_html,
            "excerpt": excerpt,
            "urlSlug": slug,
        }

        # Add SEO metadata if provided
        if seo_data:
            post_data["seoTitle"] = seo_data.get("meta_title", title)
            post_data["seoDescription"] = seo_data.get("meta_description", excerpt)

            # Add Open Graph data
            og_tags = seo_data.get("og_tags", {})
            if og_tags:
                post_data["socialTitle"] = og_tags.get("og:title", title)
                post_data["socialDescription"] = og_tags.get(
                    "og:description", excerpt
                )

        # Set publish state
        if publish:
            post_data["isDraft"] = False
        else:
            post_data["isDraft"] = True

        # Create the post
        result = self._request(
            "POST",
            f"/content/collection/{self.collection_id}/items",
            data=post_data,
        )

        return result

    def _embed_images_in_html(
        self,
        body_html: str,
        images: list[dict],
        seo_data: dict | None = None,
    ) -> str:
        """
        Embed images into the HTML body with SEO-optimized alt text.

        Places images between paragraphs for good visual flow.
        """
        alt_texts = {}
        if seo_data and "image_alt_texts" in seo_data:
            alt_texts = seo_data["image_alt_texts"]

        # Split HTML into paragraphs
        import re

        # Find paragraph/section boundaries
        sections = re.split(r"(</(?:p|h[2-6]|ul|ol)>)", body_html)

        # Distribute images evenly throughout the content
        if not images or len(sections) < 2:
            return body_html

        # Calculate insertion points (evenly spaced)
        total_sections = len(sections) // 2  # Pairs of content + closing tag
        if total_sections == 0:
            total_sections = 1
        interval = max(1, total_sections // (len(images) + 1))

        result_parts = []
        image_idx = 0
        section_count = 0

        for i, section in enumerate(sections):
            result_parts.append(section)

            # After closing tags, check if we should insert an image
            if section.startswith("</") and image_idx < len(images):
                section_count += 1
                if section_count % interval == 0:
                    img = images[image_idx]
                    alt = alt_texts.get(img["filename"], f"Blog image {image_idx + 1}")
                    img_src = f"data:{img['mime']};base64,{img.get('base64', '')}"
                    img_tag = (
                        f'\n<figure>'
                        f'<img src="{img_src}" alt="{alt}" '
                        f'width="{img.get("width", "")}" '
                        f'height="{img.get("height", "")}" '
                        f"loading=\"lazy\" />"
                        f"<figcaption>{alt}</figcaption>"
                        f"</figure>\n"
                    )
                    result_parts.append(img_tag)
                    image_idx += 1

        return "".join(result_parts)

    def get_collections(self) -> list:
        """List all blog collections (useful for finding your collection ID)."""
        result = self._request("GET", "/content/collections")
        return result.get("collections", [])
