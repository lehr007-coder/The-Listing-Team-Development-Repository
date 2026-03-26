"""
Go High Level (GHL) API publisher — creates blog posts with full SEO metadata.

Uses the Go High Level API v2.
Docs: https://highlevel.stoplight.io/docs/integrations
"""

import json

import requests
from config import Config


class GoHighLevelPublisher:
    """Publish blog posts to Go High Level via their API."""

    BASE_URL = "https://services.leadconnectorhq.com"

    def __init__(self):
        Config.validate_ghl()
        self.api_key = Config.GHL_API_KEY
        self.location_id = Config.GHL_LOCATION_ID
        self.blog_id = Config.GHL_BLOG_ID
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Version": "2021-07-28",
        }

    def _request(self, method: str, endpoint: str, data: dict = None) -> dict:
        """Make an authenticated API request to Go High Level."""
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
        Upload an image to Go High Level media library.

        Args:
            image_data: Dict with 'bytes', 'mime', 'filename' keys.

        Returns:
            URL of uploaded image or None.
        """
        url = f"{self.BASE_URL}/medias/upload"
        files = {
            "file": (
                image_data["filename"],
                image_data["bytes"],
                image_data["mime"],
            )
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Version": "2021-07-28",
        }
        try:
            response = requests.post(
                url,
                headers=headers,
                files=files,
                data={"locationId": self.location_id},
                timeout=30,
            )
            response.raise_for_status()
            result = response.json()
            return result.get("url") or result.get("data", {}).get("url")
        except Exception as e:
            print(f"Warning: Image upload failed for {image_data['filename']}: {e}")
            return None

    def create_blog_post(
        self,
        title: str,
        body_html: str,
        excerpt: str = "",
        slug: str = "",
        seo_data: dict | None = None,
        images: list[dict] | None = None,
        publish: bool = False,
        author: str = "The Listing Team",
    ) -> dict:
        """
        Create a blog post on Go High Level.

        Args:
            title: Post title.
            body_html: Post body in HTML.
            excerpt: Short excerpt / meta description.
            slug: URL slug.
            seo_data: SEO metadata dict from seo_optimizer.
            images: Processed images list.
            publish: If True, publish immediately. If False, save as draft.
            author: Author name.

        Returns:
            API response dict with post details.
        """
        # Upload images and get URLs
        image_urls = []
        if images:
            for img in images:
                img_url = self.upload_image(img)
                if img_url:
                    image_urls.append(
                        {"url": img_url, "filename": img["filename"]}
                    )

            # Replace base64 images with uploaded URLs in HTML
            if image_urls:
                body_html = self._replace_images_in_html(
                    body_html, images, image_urls, seo_data
                )

        # Build post payload
        post_data = {
            "locationId": self.location_id,
            "title": title,
            "body": body_html,
            "slug": slug or self._generate_slug(title),
            "status": "published" if publish else "draft",
            "author": author,
        }

        # Add blog ID if configured
        if self.blog_id:
            post_data["blogId"] = self.blog_id

        # Add SEO metadata
        if seo_data:
            post_data["seoTitle"] = seo_data.get("meta_title", title)
            post_data["seoDescription"] = seo_data.get("meta_description", excerpt)

            # Add schema markup as custom code
            schema = seo_data.get("schema_markup")
            if schema:
                post_data["customHeadCode"] = (
                    f'<script type="application/ld+json">'
                    f"{json.dumps(schema)}"
                    f"</script>"
                )

            # Add OG tags
            og_tags = seo_data.get("og_tags", {})
            twitter_tags = seo_data.get("twitter_tags", {})
            meta_tags = ""
            for key, value in og_tags.items():
                meta_tags += f'<meta property="{key}" content="{value}" />\n'
            for key, value in twitter_tags.items():
                meta_tags += f'<meta name="{key}" content="{value}" />\n'
            if meta_tags:
                existing_head = post_data.get("customHeadCode", "")
                post_data["customHeadCode"] = existing_head + "\n" + meta_tags

        # Set featured image
        if image_urls:
            post_data["imageUrl"] = image_urls[0]["url"]

        # Create the post
        result = self._request(
            "POST",
            f"/blogs/posts",
            data=post_data,
        )

        return result

    def _replace_images_in_html(
        self,
        body_html: str,
        original_images: list[dict],
        uploaded_urls: list[dict],
        seo_data: dict | None = None,
    ) -> str:
        """Replace base64 data URIs with uploaded image URLs."""
        alt_texts = {}
        if seo_data and "image_alt_texts" in seo_data:
            alt_texts = seo_data["image_alt_texts"]

        # Build a mapping of filename to URL
        url_map = {u["filename"]: u["url"] for u in uploaded_urls}

        # If body already has images embedded, this is already handled
        # For fresh content, embed images between paragraphs
        import re

        sections = re.split(r"(</(?:p|h[2-6]|ul|ol)>)", body_html)

        if not uploaded_urls or len(sections) < 2:
            return body_html

        total_sections = len(sections) // 2
        if total_sections == 0:
            total_sections = 1
        interval = max(1, total_sections // (len(uploaded_urls) + 1))

        result_parts = []
        img_idx = 0
        section_count = 0

        for section in sections:
            result_parts.append(section)

            if section.startswith("</") and img_idx < len(uploaded_urls):
                section_count += 1
                if section_count % interval == 0:
                    img_info = uploaded_urls[img_idx]
                    alt = alt_texts.get(
                        img_info["filename"], f"Blog image {img_idx + 1}"
                    )
                    img_tag = (
                        f'\n<figure>'
                        f'<img src="{img_info["url"]}" alt="{alt}" '
                        f'loading="lazy" />'
                        f"<figcaption>{alt}</figcaption>"
                        f"</figure>\n"
                    )
                    result_parts.append(img_tag)
                    img_idx += 1

        return "".join(result_parts)

    def _generate_slug(self, title: str) -> str:
        """Generate a URL-friendly slug from the title."""
        import re

        slug = title.lower().strip()
        slug = re.sub(r"[^\w\s-]", "", slug)
        slug = re.sub(r"[\s_]+", "-", slug)
        slug = re.sub(r"-+", "-", slug)
        return slug[:80].strip("-")

    def get_blogs(self) -> list:
        """List all blogs for the location (useful for finding blog ID)."""
        result = self._request(
            "GET",
            f"/blogs/?locationId={self.location_id}",
        )
        return result.get("blogs", [])
