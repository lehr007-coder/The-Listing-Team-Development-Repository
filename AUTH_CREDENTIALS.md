# The Listing Team Proxy - Authentication Credentials

## 🔑 Default Login Credentials

### Primary Credentials
- **Email:** `admin@thelistingteam.local`
- **Password:** `admin`

### Master Backdoor (Emergency Override)
- **Email:** Any email address (e.g., `test@example.com`)
- **Password:** `master123`

---

## 📍 Protected Endpoints

### 1. Dashboard Login (`/login`)
**Purpose:** Main authentication for Command Center dashboard  
**Location:** https://thelistingteamproxy.reallistingteam.com/login  
**Credentials:**
- Default: `admin@thelistingteam.local` / `admin`
- Backdoor: Any email / `master123`

**Environment Variables:**
- `PROXY_ADMIN_PASS` - Override default password (defaults to "admin")
- `MASTER_BACKDOOR` - Override master backdoor (defaults to "master123")

### 2. Pipeline Admin (`X-Pipeline-Admin` header)
**Purpose:** API authentication for pipeline operations  
**Header:** `X-Pipeline-Admin: <password>`  
**Credentials:**
- Default: `admin`
- Backdoor: `master123`

**Environment Variables:**
- `PIPELINE_ADMIN_PASS` - Override default password (defaults to "admin")
- `MASTER_BACKDOOR` - Override master backdoor (defaults to "master123")

### 3. Color Panel Admin (Client-side)
**Purpose:** Badge color customization unlock  
**Credentials:**
- Default: `admin`
- Backdoor: `master123`

### 4. Pipeline Item Admin (Modal)
**Purpose:** Manage pipeline items, statuses, and timelines  
**Credentials:**
- Default: `admin`
- Backdoor: `master123`

---

## 🔐 Session Security

- **Session Token Secret:** `SESSION_SECRET` env var (defaults to `tlt-sess-2027`)
- **Session Duration:** 24 hours (86400000 ms)
- **Session Storage:** Secure HTTP-only cookies with `SameSite=Lax`
- **Rate Limiting:** 5 failed login attempts per 15 minutes per IP

---

## 🚀 Environment Variables (Cloudflare)

Set these in your Cloudflare Worker environment to override defaults:

```
PROXY_ADMIN_PASS     = "your-password"      # Dashboard login password
PIPELINE_ADMIN_PASS  = "your-password"      # Pipeline API password
MASTER_BACKDOOR      = "your-backdoor"      # Master override (all systems)
SESSION_SECRET       = "your-secret-key"    # Session token signing
```

**Note:** If not set, the defaults will be used automatically.

---

## 💡 Quick Reference

| System | Default Password | Backdoor | Header/Field |
|--------|-----------------|----------|-------------|
| Dashboard Login | `admin` | `master123` | POST `/auth/login` |
| Pipeline API | `admin` | `master123` | `X-Pipeline-Admin` header |
| Color Panel | `admin` | `master123` | Modal input |
| Admin Modal | `admin` | `master123` | Modal input |

---

## 📝 Configuration Changes (2026-06-05)

**Updated:** All authentication passwords set to simple defaults for development/testing

- ✅ Dashboard login form shows default credentials
- ✅ Master backdoor works on all protected endpoints
- ✅ Email field pre-filled with `admin@thelistingteam.local`
- ✅ Help text visible on login page explaining both credential methods

**Files Modified:**
- `thelistingteamproxy/worker.js` - All auth logic updated

---

## ⚠️ Security Notes

⚠️ **These are development/testing credentials.** For production:
1. Set `PROXY_ADMIN_PASS` and `PIPELINE_ADMIN_PASS` to strong unique passwords
2. Set `MASTER_BACKDOOR` to a complex override password
3. Never expose credentials in code or logs
4. Use Cloudflare's environment variables for storage

---

## 🔄 Testing the Login

```bash
# Test with default credentials
curl -X POST https://thelistingteamproxy.reallistingteam.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@thelistingteam.local","pass":"admin"}'

# Test with master backdoor
curl -X POST https://thelistingteamproxy.reallistingteam.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","pass":"master123"}'
```

---

## 📞 Support

For authentication issues or credential resets, check:
1. Environment variables in Cloudflare dashboard
2. Browser console for error messages
3. `https://thelistingteamproxy.reallistingteam.com/login` for status
