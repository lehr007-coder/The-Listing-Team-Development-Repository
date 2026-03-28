# TLT Image Server

A self-hosted image server on **Cloudflare Workers + R2 + D1** with an admin portal for uploading, managing, and serving images via clean URLs. Built for use in GoHighLevel funnels, websites, and widgets.

## Features

- **Image Hosting** - Serve images at clean URLs (`/images/sunset-beach-a3f2`)
- **Admin Portal** - Upload images with alt title and description via a web UI
- **Drag & Drop Upload** - Drag images into the browser to upload
- **GHL Ready** - Embeddable widget for GoHighLevel funnels and websites
- **Search & Manage** - Search, edit metadata, and delete images
- **Copy URLs** - One-click copy of image URLs for embedding
- **Cloudflare Edge** - Images served globally from Cloudflare's CDN
- **Zero Server Management** - No VPS, no Docker, no maintenance

## Architecture

| Service | Purpose |
|---------|---------|
| **Cloudflare Workers** | Serverless backend (API + admin UI) |
| **Cloudflare R2** | Image file storage (S3-compatible, no egress fees) |
| **Cloudflare D1** | SQLite database for image metadata |

## Setup & Deployment

### Prerequisites

- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works)
- [Node.js](https://nodejs.org/) 18+ installed locally
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (`npm install -g wrangler`)

### Step 1: Install dependencies

```bash
npm install
```

### Step 2: Login to Cloudflare

```bash
wrangler login
```

### Step 3: Create R2 bucket

```bash
wrangler r2 bucket create tlt-images
```

### Step 4: Create D1 database

```bash
wrangler d1 create tlt-images-db
```

This outputs a `database_id`. Copy it and update `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "tlt-images-db"
database_id = "YOUR-DATABASE-ID-HERE"
```

### Step 5: Run database migration

```bash
npm run db:migrate
```

### Step 6: Set admin credentials

```bash
wrangler secret put ADMIN_USERNAME
# Enter your username when prompted

wrangler secret put ADMIN_PASSWORD
# Enter a strong password when prompted
```

### Step 7: Update BASE_URL

Edit `wrangler.toml` and set your Worker URL:

```toml
[vars]
BASE_URL = "https://tlt-image-server.YOUR-SUBDOMAIN.workers.dev"
```

### Step 8: Deploy

```bash
npm run deploy
```

Your image server is now live at `https://tlt-image-server.YOUR-SUBDOMAIN.workers.dev`

## Usage

### Admin Portal

Visit `https://your-worker.workers.dev/admin` and log in with your credentials.

### Using Images in GHL

**Direct URL** - Paste into any GHL image element:
```
https://your-worker.workers.dev/images/your-image-slug
```

**Embed Widget** - Add to a GHL Custom HTML/JS element:
```html
<div class="tlt-image" data-slug="your-image-slug"></div>
<script src="https://your-worker.workers.dev/embed/widget.js"
        data-server="https://your-worker.workers.dev"></script>
```

See the full GHL Embed Guide at `/admin/embed-guide.html` in your admin portal.

### Using Images on Any Website

```html
<img src="https://your-worker.workers.dev/images/my-photo-a3f2" alt="My Photo">
```

## Local Development

```bash
# Set local secrets
cp .env.example .dev.vars  # edit with your test credentials

# Run local migration
npm run db:migrate:local

# Start dev server
npm run dev
```

## API Reference

### Public Endpoints (no auth)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/images/:slug` | Serve an image |
| GET | `/images/:slug/info` | Image metadata as JSON |
| GET | `/api/gallery` | Public image listing for widgets |

### Admin Endpoints (Basic Auth)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin` | Admin portal UI |
| POST | `/admin/api/images` | Upload image (multipart form) |
| GET | `/admin/api/images` | List images (paginated) |
| GET | `/admin/api/images/:id` | Get image details |
| PUT | `/admin/api/images/:id` | Update metadata |
| DELETE | `/admin/api/images/:id` | Delete image |
| GET | `/admin/api/stats` | Dashboard stats |

## Custom Domain (Optional)

1. Go to Cloudflare Dashboard > Workers & Pages
2. Click your worker > Settings > Triggers
3. Add a Custom Domain (e.g., `images.yourdomain.com`)
4. Update `BASE_URL` in `wrangler.toml` and redeploy

## Costs

Cloudflare's free tier includes:
- **Workers**: 100,000 requests/day
- **R2**: 10 GB storage, 10 million reads/month
- **D1**: 5 million rows read/day, 100,000 rows written/day

For most image hosting needs, this stays well within the free tier.
