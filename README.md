# TLT Image Server

Image hosting server on **Cloudflare Workers + R2 + D1** for The Real Listing Team. Serves images at `https://images.reallistingteam.com` with an admin portal for uploading and managing images with alt titles and descriptions.

## Features

- **Image Hosting** - Serve images at `https://images.reallistingteam.com/images/your-slug`
- **Admin Portal** - Upload images with alt title and description at `/admin`
- **Drag & Drop Upload** - Drag images into the browser to upload
- **GHL Ready** - Embeddable widget for GoHighLevel funnels and websites
- **Search & Manage** - Search, edit metadata, and delete images
- **Copy URLs** - One-click copy for embedding
- **Cloudflare Edge** - Images served globally from Cloudflare's CDN
- **Zero Server Costs** - Runs on Cloudflare free tier

## Architecture

| Service | Purpose |
|---------|---------|
| **Cloudflare Workers** | Serverless backend (API + admin UI) |
| **Cloudflare R2** | Image file storage (no egress fees) |
| **Cloudflare D1** | SQLite database for image metadata |

## Setup & Deployment

### Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up) with `reallistingteam.com` domain
- [Node.js](https://nodejs.org/) 18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (`npm install -g wrangler`)

### Step 1: Install & Login

```bash
npm install
wrangler login
```

### Step 2: Create R2 bucket

```bash
wrangler r2 bucket create tlt-images
```

### Step 3: Create D1 database

```bash
wrangler d1 create tlt-images-db
```

Copy the `database_id` from the output and paste it into `wrangler.toml`:

```toml
database_id = "paste-your-id-here"
```

### Step 4: Run database migration

```bash
npm run db:migrate
```

### Step 5: Set admin credentials

```bash
wrangler secret put ADMIN_USERNAME
wrangler secret put ADMIN_PASSWORD
```

### Step 6: Deploy

```bash
npm run deploy
```

### Step 7: Add custom domain

1. Go to Cloudflare Dashboard > Workers & Pages
2. Click `tlt-image-server` > Settings > Triggers
3. Click "Add Custom Domain"
4. Enter `images.reallistingteam.com`

## Usage

### Admin Portal

`https://images.reallistingteam.com/admin`

Log in with your credentials, upload images with alt titles and descriptions, manage your library.

### Using Images in GHL Funnels

**Direct URL** - Paste into any GHL image element:
```
https://images.reallistingteam.com/images/your-image-slug
```

**Embed Widget** - Add to a GHL Custom HTML/JS element:
```html
<div class="tlt-image" data-slug="your-image-slug"></div>
<script src="https://images.reallistingteam.com/embed/widget.js"
        data-server="https://images.reallistingteam.com"></script>
```

**Image Gallery** - Show a grid of images:
```html
<div class="tlt-gallery" data-columns="3" data-limit="6" data-captions="true"></div>
<script src="https://images.reallistingteam.com/embed/widget.js"
        data-server="https://images.reallistingteam.com"></script>
```

Full GHL embed guide with copy-paste snippets available at `/admin/embed-guide.html`.

### Using Images on Any Website

```html
<img src="https://images.reallistingteam.com/images/my-photo-a3f2" alt="My Photo">
```

## Local Development

```bash
cp .env.example .dev.vars   # edit with test credentials
npm run db:migrate:local
npm run dev
```

## API Reference

### Public (no auth)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/images/:slug` | Serve image |
| GET | `/images/:slug/info` | Image metadata (JSON) |
| GET | `/api/gallery` | Image listing for widgets |

### Admin (Basic Auth)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin` | Admin portal |
| POST | `/admin/api/images` | Upload image |
| GET | `/admin/api/images` | List images |
| PUT | `/admin/api/images/:id` | Update metadata |
| DELETE | `/admin/api/images/:id` | Delete image |
| GET | `/admin/api/stats` | Stats |

## Cloudflare Free Tier Limits

- **Workers**: 100,000 requests/day
- **R2**: 10 GB storage, 10 million reads/month
- **D1**: 5 million rows read/day, 100,000 rows written/day
