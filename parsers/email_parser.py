"""
Parse email files (.eml) to extract image attachments.

Supports extracting images that are attached to emails alongside
Word documents, so all assets are available for the blog post.
"""

from __future__ import annotations

import email
import os
from email import policy
from email.parser import BytesParser

# Image MIME types we care about
IMAGE_MIMES = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/bmp",
    "image/tiff",
}


def parse_email_attachments(file_path_or_bytes) -> list[dict]:
    """
    Extract image attachments from an .eml file.

    Args:
        file_path_or_bytes: Path to .eml file or BytesIO with email content.

    Returns:
        List of dicts: [{filename, bytes, mime}]
    """
    if isinstance(file_path_or_bytes, (str, os.PathLike)):
        with open(file_path_or_bytes, "rb") as f:
            msg = BytesParser(policy=policy.default).parse(f)
    else:
        msg = BytesParser(policy=policy.default).parsebytes(file_path_or_bytes.read())

    images = []

    for part in msg.walk():
        content_type = part.get_content_type()
        content_disposition = str(part.get("Content-Disposition", ""))

        # Grab both inline images and attached images
        if content_type in IMAGE_MIMES:
            payload = part.get_payload(decode=True)
            if payload:
                filename = part.get_filename()
                if not filename:
                    ext = content_type.split("/")[-1]
                    if ext == "jpeg":
                        ext = "jpg"
                    filename = f"email_image_{len(images) + 1:03d}.{ext}"

                images.append(
                    {
                        "filename": filename,
                        "bytes": payload,
                        "mime": content_type,
                    }
                )

    return images


def extract_images_from_uploaded_files(uploaded_files: list) -> list[dict]:
    """
    Handle directly uploaded image files (PNG, JPG, etc.).

    Args:
        uploaded_files: List of Streamlit UploadedFile objects that are images.

    Returns:
        List of dicts: [{filename, bytes, mime}]
    """
    images = []
    for f in uploaded_files:
        mime = f.type if hasattr(f, "type") else "image/png"
        if any(mime.startswith(m.split("/")[0]) for m in IMAGE_MIMES):
            images.append(
                {
                    "filename": f.name,
                    "bytes": f.read(),
                    "mime": mime,
                }
            )
    return images
