# The Listing Team — Blog Automation Tool

Automated blog posting pipeline: upload a Word document, spin content for SEO, generate full metadata, and publish to Squarespace and/or Go High Level.

## What It Does

1. **Parses** Word documents (.docx) — extracts text and all embedded images
2. **Accepts** additional images from email (.eml files) or direct upload
3. **Spins** content using Claude AI — light, medium, or heavy rewrite for SEO uniqueness
4. **Generates full SEO package** — meta tags, Open Graph, schema markup, alt text, keyword analysis, URL slugs
5. **Publishes** to Squarespace and/or Go High Level with one click
6. **Posts original (unspun) version** if preferred
7. **Spins unique versions** for additional websites — each version is 100% unique to avoid duplicate content penalties

## Quick Start

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Configure API Keys

```bash
cp .env.example .env
```

Edit `.env` and fill in your keys (see "Getting Your API Keys" below).

### 3. Run the App

```bash
streamlit run app.py
```

Opens a web UI at `http://localhost:8501`.

## Getting Your API Keys

### Anthropic (Claude) API Key — Required
- Go to [console.anthropic.com](https://console.anthropic.com/settings/keys)
- Create an API key
- Add to `.env` as `ANTHROPIC_API_KEY`

### Squarespace API Key
1. Log into your Squarespace site
2. Go to **Settings → Developer API Keys**
3. Click **Generate API Key**
4. Copy the key to `.env` as `SQUARESPACE_API_KEY`
5. Find your **Site ID** in Settings → General
6. Find your **Blog Collection ID** — go to your blog page, check the URL or use the API to list collections

### Go High Level API Key
1. Log into Go High Level
2. Go to **Settings → Business Profile → API Keys**
3. Generate a new API key with blog/post permissions
4. Copy to `.env` as `GHL_API_KEY`
5. Your **Location ID** is in the URL when viewing your location (`/location/YOUR_ID/...`)
6. **Blog ID** — optional, use the default blog if not set

## Usage

### Basic Flow
1. **Upload** your `.docx` file (and any extra images)
2. **Set** spin intensity, tone, and target keywords
3. **Click** "Spin & Optimize Content"
4. **Review** the spun content and SEO metadata
5. **Choose** Squarespace, Go High Level, or both
6. **Click** "Publish Now"

### Spinning for Additional Websites
After spinning your main version:
1. Scroll to "Step 4: Spin for Additional Websites"
2. Enter the website name, URL, and target keywords
3. Click "Generate Unique Version"
4. Download the JSON or manually post it

Each version is spun from the **original** source to maximize uniqueness between all versions.

## Project Structure

```
├── app.py                    # Streamlit web UI
├── config.py                 # Environment configuration
├── requirements.txt          # Python dependencies
├── .env.example              # Template for API keys
├── parsers/
│   ├── docx_parser.py        # Word document parser
│   └── email_parser.py       # Email attachment extractor
├── processors/
│   ├── spinner.py            # Claude-powered content spinner
│   └── seo_optimizer.py      # Full SEO metadata generator
├── publishers/
│   ├── squarespace.py        # Squarespace API publisher
│   └── gohighlevel.py        # Go High Level API publisher
└── utils/
    └── image_handler.py      # Image processing and optimization
```
