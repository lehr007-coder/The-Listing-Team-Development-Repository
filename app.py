"""
Blog Automation Tool — The Listing Team
========================================
Upload a Word doc, spin content for SEO, and post to Squarespace or Go High Level.

Run with: streamlit run app.py
"""

import io
import json
import streamlit as st

from parsers.docx_parser import parse_docx, ParsedBlog
from parsers.email_parser import parse_email_attachments, extract_images_from_uploaded_files
from processors.spinner import spin_content, spin_for_additional_site
from processors.seo_optimizer import optimize_seo
from publishers.squarespace import SquarespacePublisher
from publishers.gohighlevel import GoHighLevelPublisher
from utils.image_handler import prepare_images_for_upload

# ── Page Config ──────────────────────────────────────────────
st.set_page_config(
    page_title="Blog Automation | The Listing Team",
    page_icon="📝",
    layout="wide",
)

st.title("Blog Automation Tool")
st.caption("Upload → Spin → SEO Optimize → Publish")

# ── Session State Initialization ─────────────────────────────
defaults = {
    "parsed_blog": None,
    "all_images": [],
    "spun_content": None,
    "seo_data": None,
    "additional_spins": [],
    "publish_results": [],
}
for key, val in defaults.items():
    if key not in st.session_state:
        st.session_state[key] = val

# ══════════════════════════════════════════════════════════════
# STEP 1: UPLOAD
# ══════════════════════════════════════════════════════════════
st.header("Step 1: Upload Blog Content")

col1, col2 = st.columns(2)

with col1:
    st.subheader("Word Document")
    docx_file = st.file_uploader(
        "Upload your .docx blog file",
        type=["docx"],
        key="docx_upload",
    )

with col2:
    st.subheader("Additional Images")
    extra_images = st.file_uploader(
        "Upload extra images (from email, etc.)",
        type=["png", "jpg", "jpeg", "gif", "webp"],
        accept_multiple_files=True,
        key="image_upload",
    )
    email_file = st.file_uploader(
        "Or upload an .eml email file to extract image attachments",
        type=["eml"],
        key="email_upload",
    )

# Parse button
if docx_file and st.button("Parse Document", type="primary"):
    with st.spinner("Parsing Word document..."):
        blog = parse_docx(io.BytesIO(docx_file.read()))
        st.session_state.parsed_blog = blog

        # Collect all images
        all_images = list(blog.images)

        # Add extra uploaded images
        if extra_images:
            uploaded_imgs = extract_images_from_uploaded_files(extra_images)
            all_images.extend(uploaded_imgs)

        # Add images from email
        if email_file:
            email_imgs = parse_email_attachments(io.BytesIO(email_file.read()))
            all_images.extend(email_imgs)

        st.session_state.all_images = all_images

    st.success(
        f"Parsed: **{blog.title}** — "
        f"{len(blog.paragraphs)} paragraphs, {len(all_images)} images"
    )

# Show parsed content
if st.session_state.parsed_blog:
    blog = st.session_state.parsed_blog
    with st.expander("Preview Original Content", expanded=False):
        st.markdown(f"**Title:** {blog.title}")
        st.markdown("---")
        st.text(blog.full_text()[:2000] + ("..." if len(blog.full_text()) > 2000 else ""))
        if st.session_state.all_images:
            st.markdown(f"**{len(st.session_state.all_images)} image(s) extracted**")

# ══════════════════════════════════════════════════════════════
# STEP 2: SPIN & OPTIMIZE
# ══════════════════════════════════════════════════════════════
if st.session_state.parsed_blog:
    st.header("Step 2: Spin & SEO Optimize")

    col1, col2 = st.columns(2)

    with col1:
        spin_intensity = st.select_slider(
            "Spin Intensity",
            options=["light", "medium", "heavy"],
            value="medium",
            help="Light = minor rewording. Heavy = complete rewrite.",
        )
        tone = st.selectbox(
            "Writing Tone",
            ["professional", "casual", "authoritative", "friendly", "conversational"],
            index=0,
        )

    with col2:
        target_keywords = st.text_input(
            "Target SEO Keywords (comma-separated)",
            placeholder="real estate, homes for sale, luxury listings",
        )
        business_name = st.text_input("Business Name", value="The Listing Team")

    keywords_list = (
        [k.strip() for k in target_keywords.split(",") if k.strip()]
        if target_keywords
        else None
    )

    # ── Spin button ──
    if st.button("Spin & Optimize Content", type="primary"):
        blog = st.session_state.parsed_blog

        with st.spinner("Spinning content with Claude AI..."):
            spun = spin_content(
                title=blog.title,
                body_text=blog.full_text(),
                target_keywords=keywords_list,
                tone=tone,
                spin_intensity=spin_intensity,
            )
            st.session_state.spun_content = spun

        with st.spinner("Generating full SEO package..."):
            processed_images = prepare_images_for_upload(st.session_state.all_images)
            st.session_state.all_images = processed_images

            seo = optimize_seo(
                title=spun["title"],
                body_html=spun["body_html"],
                images=processed_images,
                business_name=business_name,
                target_keywords=keywords_list,
            )
            st.session_state.seo_data = seo

        st.success("Content spun and SEO optimized!")

    # Show spun content
    if st.session_state.spun_content:
        spun = st.session_state.spun_content
        with st.expander("Preview Spun Content", expanded=True):
            st.markdown(f"### {spun['title']}")
            st.markdown(spun["body_html"], unsafe_allow_html=True)
            st.markdown(f"**Excerpt:** {spun.get('excerpt', '')}")

    # Show SEO data
    if st.session_state.seo_data:
        seo = st.session_state.seo_data
        with st.expander("SEO Metadata Package", expanded=False):
            col1, col2 = st.columns(2)
            with col1:
                st.markdown(f"**Meta Title:** {seo.get('meta_title', '')}")
                st.markdown(f"**Meta Description:** {seo.get('meta_description', '')}")
                st.markdown(f"**URL Slug:** {seo.get('url_slug', '')}")
                st.markdown("**Keywords:**")
                kw = seo.get("keyword_analysis", {})
                st.markdown(f"- Primary: {kw.get('primary_keyword', '')}")
                st.markdown(f"- Secondary: {', '.join(kw.get('secondary_keywords', []))}")
                st.markdown(f"- LSI: {', '.join(kw.get('lsi_keywords', []))}")
            with col2:
                st.markdown("**Open Graph Tags:**")
                st.json(seo.get("og_tags", {}))
                st.markdown("**Schema Markup:**")
                st.json(seo.get("schema_markup", {}))
                st.markdown("**Image Alt Texts:**")
                st.json(seo.get("image_alt_texts", {}))

# ══════════════════════════════════════════════════════════════
# STEP 3: PUBLISH
# ══════════════════════════════════════════════════════════════
if st.session_state.spun_content and st.session_state.seo_data:
    st.header("Step 3: Publish")

    # Choose what to publish
    publish_version = st.radio(
        "Which version to publish?",
        ["Spun (SEO-optimized)", "Original (as-is)"],
        horizontal=True,
    )

    if publish_version == "Original (as-is)":
        pub_title = st.session_state.parsed_blog.title
        pub_body = st.session_state.parsed_blog.full_text()
        # Wrap original text in basic HTML paragraphs
        pub_body = "".join(f"<p>{p}</p>" for p in pub_body.split("\n\n") if p.strip())
    else:
        pub_title = st.session_state.spun_content["title"]
        pub_body = st.session_state.spun_content["body_html"]

    pub_excerpt = st.session_state.spun_content.get("excerpt", "")
    pub_slug = st.session_state.seo_data.get("url_slug", "")

    publish_as_draft = st.checkbox("Save as draft (don't publish immediately)", value=True)

    st.subheader("Choose Destination(s)")
    col1, col2 = st.columns(2)

    with col1:
        post_to_squarespace = st.checkbox("Post to Squarespace", value=False)
    with col2:
        post_to_ghl = st.checkbox("Post to Go High Level", value=False)

    if (post_to_squarespace or post_to_ghl) and st.button(
        "Publish Now", type="primary"
    ):
        results = []

        if post_to_squarespace:
            with st.spinner("Publishing to Squarespace..."):
                try:
                    sq = SquarespacePublisher()
                    result = sq.create_blog_post(
                        title=pub_title,
                        body_html=pub_body,
                        excerpt=pub_excerpt,
                        slug=pub_slug,
                        seo_data=st.session_state.seo_data,
                        images=st.session_state.all_images,
                        publish=not publish_as_draft,
                    )
                    results.append({"platform": "Squarespace", "status": "Success", "details": result})
                    st.success("Published to Squarespace!")
                except Exception as e:
                    results.append({"platform": "Squarespace", "status": "Error", "details": str(e)})
                    st.error(f"Squarespace error: {e}")

        if post_to_ghl:
            with st.spinner("Publishing to Go High Level..."):
                try:
                    ghl = GoHighLevelPublisher()
                    result = ghl.create_blog_post(
                        title=pub_title,
                        body_html=pub_body,
                        excerpt=pub_excerpt,
                        slug=pub_slug,
                        seo_data=st.session_state.seo_data,
                        images=st.session_state.all_images,
                        publish=not publish_as_draft,
                        author=business_name if "business_name" in dir() else "The Listing Team",
                    )
                    results.append({"platform": "Go High Level", "status": "Success", "details": result})
                    st.success("Published to Go High Level!")
                except Exception as e:
                    results.append({"platform": "Go High Level", "status": "Error", "details": str(e)})
                    st.error(f"Go High Level error: {e}")

        st.session_state.publish_results = results

# ══════════════════════════════════════════════════════════════
# STEP 4: SPIN FOR ADDITIONAL WEBSITES
# ══════════════════════════════════════════════════════════════
if st.session_state.spun_content:
    st.header("Step 4: Spin for Additional Websites")
    st.caption(
        "Generate a 100% unique version of this blog for another website. "
        "Each version will be completely different to avoid duplicate content penalties."
    )

    with st.form("additional_spin_form"):
        site_name = st.text_input(
            "Website Name",
            placeholder="My Other Real Estate Site",
        )
        site_url = st.text_input(
            "Website URL",
            placeholder="https://www.example.com",
        )
        site_keywords = st.text_input(
            "Target Keywords for This Site (comma-separated)",
            placeholder="real estate agent, buy a home, property listings",
        )
        site_tone = st.selectbox(
            "Tone for This Site",
            ["professional", "casual", "authoritative", "friendly", "conversational"],
            index=0,
            key="site_tone",
        )

        spin_submitted = st.form_submit_button("Generate Unique Version", type="primary")

    if spin_submitted and site_name and site_url:
        site_kw_list = (
            [k.strip() for k in site_keywords.split(",") if k.strip()]
            if site_keywords
            else None
        )

        with st.spinner(f"Creating unique version for {site_name}..."):
            # Use the ORIGINAL content as the source (not the already-spun version)
            # to maximize uniqueness between versions
            blog = st.session_state.parsed_blog
            new_spin = spin_for_additional_site(
                original_title=blog.title,
                original_body=blog.full_text(),
                target_site_name=site_name,
                target_site_url=site_url,
                target_keywords=site_kw_list,
                tone=site_tone,
            )

            # Also generate SEO for this version
            new_seo = optimize_seo(
                title=new_spin["title"],
                body_html=new_spin["body_html"],
                images=st.session_state.all_images,
                target_url=site_url,
                business_name=site_name,
                target_keywords=site_kw_list,
            )

            new_spin["seo_data"] = new_seo
            st.session_state.additional_spins.append(new_spin)

        st.success(f"Unique version created for {site_name}!")

    # Display additional spins
    for i, spin in enumerate(st.session_state.additional_spins):
        with st.expander(
            f"Version for: {spin.get('target_site', f'Site {i+1}')}", expanded=False
        ):
            st.markdown(f"### {spin['title']}")
            st.markdown(spin["body_html"], unsafe_allow_html=True)
            st.markdown(f"**Excerpt:** {spin.get('excerpt', '')}")
            st.markdown(f"**Keywords:** {', '.join(spin.get('keywords_used', []))}")

            if spin.get("seo_data"):
                st.markdown("**SEO Package:**")
                st.json(spin["seo_data"])

            # Download button for this version
            download_data = {
                "title": spin["title"],
                "body_html": spin["body_html"],
                "excerpt": spin.get("excerpt", ""),
                "seo_data": spin.get("seo_data", {}),
            }
            st.download_button(
                label=f"Download {spin.get('target_site', 'Site')} Version (JSON)",
                data=json.dumps(download_data, indent=2),
                file_name=f"blog_{spin.get('target_site', 'site').replace(' ', '_').lower()}.json",
                mime="application/json",
                key=f"download_{i}",
            )

# ══════════════════════════════════════════════════════════════
# SIDEBAR — Configuration Status
# ══════════════════════════════════════════════════════════════
with st.sidebar:
    st.header("Configuration Status")

    from config import Config

    # Check API keys
    st.markdown("**API Keys:**")
    st.markdown(
        f"- Anthropic (Claude): {'Configured' if Config.ANTHROPIC_API_KEY else 'Missing'}"
    )
    st.markdown(
        f"- Squarespace: {'Configured' if Config.SQUARESPACE_API_KEY else 'Missing'}"
    )
    st.markdown(
        f"- Go High Level: {'Configured' if Config.GHL_API_KEY else 'Missing'}"
    )

    st.markdown("---")
    st.markdown("**Quick Setup:**")
    st.markdown(
        "1. Copy `.env.example` to `.env`\n"
        "2. Fill in your API keys\n"
        "3. Restart the app"
    )

    st.markdown("---")
    st.markdown("**Pipeline:**")
    st.markdown(
        "1. Upload `.docx` + images\n"
        "2. Spin & optimize for SEO\n"
        "3. Publish to Squarespace / GHL\n"
        "4. Spin unique versions for other sites"
    )
