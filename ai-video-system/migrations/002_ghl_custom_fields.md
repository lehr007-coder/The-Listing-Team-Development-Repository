# GHL Custom Fields — ai-video-system

These fields are **owned** by the AI Video sidecar. Create them in
GHL → Settings → Custom Fields → Contact ONLY if they don't already exist
(see "Existing field check" below).

> Field group: **AI Video**
> Object: **Contact**

| Key (fieldKey)            | Type                | Notes                                      |
|---------------------------|---------------------|--------------------------------------------|
| `ai_video_type`           | Single Line         | seller_valuation, fsbo_outreach, …         |
| `ai_video_script`         | Multi Line          | Latest generated script                    |
| `ai_video_scene_plan`     | Multi Line (JSON)   | FCPXML director output (JSON string)       |
| `video_render_engine`     | Single Line         | HEYGEN \| FCPXML                           |
| `video_priority_score`    | Number              | 0–100                                      |
| `video_trigger_reason`    | Single Line         | Free-form e.g. "Ylopo HOT lead — 3 favs"   |
| `video_status`            | Single Line         | queued/rendering/rendered/delivering/delivered/failed |
| `video_render_job_id`     | Single Line         | `vj_…` id                                  |
| `video_url`               | URL                 | Hosted page URL                            |
| `video_gif_url`           | URL                 | Animated preview GIF                       |
| `video_thumbnail_url`     | URL                 | JPG thumb                                  |
| `video_last_rendered`     | Date Time           | ISO from sidecar                           |
| `video_last_sent`         | Date Time           | ISO from sidecar                           |
| `video_delivery_method`   | Single Line         | comma list: sms,email,conversation         |
| `video_opened`            | Single Line (bool)  | "true"                                     |
| `video_clicked`           | Single Line (bool)  | "true"                                     |
| `video_watch_percent`     | Number              | 25/50/75/100                               |
| `video_engagement_score`  | Number              | running total                              |
| `social_content_type`     | Single Line         | luxury_listing, market_update, …           |
| `worthy_of_social`        | Single Line (bool)  | gate for FCPXML auto-trigger               |
| `last_video_type`         | Single Line         | rolling                                    |
| `last_video_cta`          | Single Line         | rolling                                    |

## Existing field check

**Before creating any field**, run this check from the sidecar's deploy
machine (or from any worker that has the GHL token):

```bash
curl -s "https://services.leadconnectorhq.com/locations/<LOC>/customFields" \
  -H "Authorization: Bearer $GHL_V2_TOKEN" \
  -H "Version: 2021-07-28" \
  | jq -r '.customFields[] | .fieldKey' \
  | sort > existing.txt

cat <<'EOF' | sort > needed.txt
ai_video_type
ai_video_script
ai_video_scene_plan
video_render_engine
video_priority_score
video_trigger_reason
video_status
video_render_job_id
video_url
video_gif_url
video_thumbnail_url
video_last_rendered
video_last_sent
video_delivery_method
video_opened
video_clicked
video_watch_percent
video_engagement_score
social_content_type
worthy_of_social
last_video_type
last_video_cta
EOF

comm -23 needed.txt existing.txt   # ← these are the ones to create
```

Only create the fields that come back from `comm -23`. **Do not** rename
or delete anything that already exists — even if the type looks wrong,
ask before changing it.
