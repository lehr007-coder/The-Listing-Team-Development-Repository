"""
Image processing utilities — resize, compress, and prepare images for upload.
"""

from __future__ import annotations

import base64
import io

from PIL import Image


MAX_WIDTH = 1200  # Max width in pixels for blog images
QUALITY = 85  # JPEG compression quality


def prepare_images_for_upload(images: list[dict]) -> list[dict]:
    """
    Process images for web upload: resize if too large, compress, generate base64.

    Args:
        images: List of image dicts [{filename, bytes, mime}]

    Returns:
        Same list with added 'base64' and 'optimized_bytes' keys,
        and images resized/compressed for web.
    """
    processed = []
    for img_data in images:
        raw_bytes = img_data["bytes"]
        try:
            image = Image.open(io.BytesIO(raw_bytes))
        except Exception:
            # If we can't open it as an image, skip
            continue

        # Convert RGBA to RGB for JPEG compatibility
        if image.mode == "RGBA":
            background = Image.new("RGB", image.size, (255, 255, 255))
            background.paste(image, mask=image.split()[3])
            image = background
        elif image.mode != "RGB":
            image = image.convert("RGB")

        # Resize if wider than MAX_WIDTH
        if image.width > MAX_WIDTH:
            ratio = MAX_WIDTH / image.width
            new_height = int(image.height * ratio)
            image = image.resize((MAX_WIDTH, new_height), Image.LANCZOS)

        # Save to bytes
        buffer = io.BytesIO()
        save_format = "JPEG"
        mime = "image/jpeg"
        ext = "jpg"

        if img_data.get("mime") == "image/png":
            save_format = "PNG"
            mime = "image/png"
            ext = "png"

        image.save(buffer, format=save_format, quality=QUALITY, optimize=True)
        optimized_bytes = buffer.getvalue()

        # Generate base64 for APIs that need it
        b64 = base64.b64encode(optimized_bytes).decode("utf-8")

        filename = img_data.get("filename", f"image.{ext}")

        processed.append(
            {
                "filename": filename,
                "bytes": optimized_bytes,
                "base64": b64,
                "mime": mime,
                "width": image.width,
                "height": image.height,
            }
        )

    return processed
