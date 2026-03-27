# TLT Image Server

A self-hosted image server with an admin portal for uploading, managing, and serving images via clean URLs.

## Features

- **Image Hosting** - Serve images at clean, slug-based URLs (e.g., `/images/sunset-beach-a3f2`)
- **Admin Portal** - Upload images with alt title and description via a web UI
- **Drag & Drop** - Upload images by dragging them into the browser
- **Search & Manage** - Search, edit metadata, and delete images
- **Copy URLs** - One-click copy of image URLs for use on websites
- **Image Metadata** - JSON endpoint for each image's alt text, dimensions, and description
- **Docker Ready** - Deploy with a single `docker compose up -d`

## Quick Start (Local Development)

```bash
# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env to set your ADMIN_USERNAME and ADMIN_PASSWORD

# Start the server
npm run dev
```

- Admin portal: http://localhost:3000/admin (requires login)
- Images served at: http://localhost:3000/images/<slug>

## Docker Deployment

```bash
cp .env.example .env
# Edit .env with your settings

docker compose up -d
```

## VPS Deployment

1. Install Docker on your VPS
2. Clone this repo and `cd` into it
3. Configure `.env` (set strong admin password, set `BASE_URL` to your domain)
4. Run `docker compose up -d`
5. Set up a reverse proxy (nginx) with HTTPS:

```nginx
server {
    listen 443 ssl;
    server_name images.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/images.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/images.yourdomain.com/privkey.pem;

    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## API Reference

### Public Endpoints (no auth required)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/images/:slug` | Serve an image |
| GET | `/images/:slug/info` | Get image metadata as JSON |

### Admin Endpoints (Basic Auth required)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin` | Admin portal UI |
| POST | `/admin/api/images` | Upload an image (multipart form) |
| GET | `/admin/api/images` | List images (paginated, searchable) |
| GET | `/admin/api/images/:id` | Get single image details |
| PUT | `/admin/api/images/:id` | Update alt title, description, slug |
| DELETE | `/admin/api/images/:id` | Delete an image |
| GET | `/admin/api/stats` | Dashboard stats |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `HOST` | `0.0.0.0` | Bind address |
| `ADMIN_USERNAME` | `admin` | Admin login username |
| `ADMIN_PASSWORD` | `changeme` | Admin login password |
| `UPLOAD_DIR` | `./uploads` | Image storage directory |
| `DATABASE_DIR` | `./data` | SQLite database directory |
| `BASE_URL` | `http://localhost:3000` | Public base URL for image links |
| `MAX_FILE_SIZE_MB` | `10` | Max upload file size in MB |

## Using Images on Your Websites

```html
<img src="https://images.yourdomain.com/images/my-photo-a3f2" alt="My Photo">
```
