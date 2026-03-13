# AdMob Mediation Tool

Internal tool for automating AdMob mediation — Create apps, ad units, mapping, and mediation groups across Pangle, Liftoff, and Mintegral.

## Stack

- **Framework**: Next.js 15 (App Router, TypeScript)
- **Auth**: Google OAuth 2.0 Server-side (Authorization Code flow — no PKCE)
- **Token storage**: AES-256-GCM encrypted refresh token in SQLite/PostgreSQL (Prisma)
- **Session**: httpOnly JWT cookie (8h)
- **Networks**: AdMob, Pangle, Liftoff Monetize, Mintegral

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Setup environment

```bash
cp .env.local .env.local.bak  # backup template
```

Edit `.env.local` and fill in:
- `SESSION_SECRET` → `openssl rand -base64 32`
- `ENCRYPTION_KEY` → `openssl rand -hex 32`
- `ADMIN_KEY` → `openssl rand -hex 32`
- Credentials from `Deployment_Secrets_Checklist.docx`

### 3. Setup database

```bash
npm run db:push   # SQLite for dev
```

### 4. Run dev server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

### 5. Configure Google OAuth callback

In Google Cloud Console → Credentials → your OAuth Client:
- Add Authorized Redirect URI: `http://localhost:3000/api/auth/callback`

## Features

### Authentication
- Google OAuth 2.0 — users sign in with their company email
- Publisher auto-resolution: system checks which AdMob publisher (Nami/Nasus) the email has access to
- Only 1 publisher match allowed — multiple matches blocks write operations

### Create App
- Create app on AdMob via API
- Manual (not yet live on store) by default

### Create Ad Unit (Bulk CSV)
- Upload CSV with `ad_unit_name`, `admob_unit_id`, `ad_format`
- Auto-detect format from unit name keywords
- Bulk create on AdMob with correct `adTypes` per format
- High floor detection from name (`_high`, `_1`, `_2`)

### Mapping + Mediation Groups
Upload CSV with placement IDs → Configure scenario → Preview → Execute.

**6 scenarios:**

| Scenario | Group by | eCPM Floor | Country |
|----------|----------|------------|---------|
| S1 | Ad Unit | ON (auto) | All |
| S2 | Ad Format | OFF | All |
| S3 | Ad Format | ON | All |
| S4 | Ad Unit | ON (auto) | Groups |
| S5 | Ad Format | OFF | Groups |
| S6 | Ad Format | ON | Groups |

**Naming rules:**
- S1/S4: `{app_code} - {ad_unit_name}`
- S2/S5: `{app_code} - {ad_format}`
- S3/S6: `{app_code} - {ad_format} - high/normal`

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/auth/login` | Start OAuth flow |
| GET | `/api/auth/callback` | OAuth callback |
| POST | `/api/auth/logout` | Clear session |
| GET | `/api/accounts` | Resolve publisher |
| GET | `/api/apps` | List apps |
| POST | `/api/apps` | Create app |
| GET | `/api/adunits` | List ad units |
| POST | `/api/adunits` | Bulk create ad units |
| POST | `/api/mapping/preview` | Preview mediation groups |
| POST | `/api/mapping/execute` | Execute mapping + create groups |

## Security

- ✅ Refresh tokens encrypted with AES-256-GCM before DB storage
- ✅ Server-side token handling — tokens never exposed to browser
- ✅ httpOnly + Secure + SameSite=Lax session cookie
- ✅ CSRF protection via state parameter in OAuth flow
- ✅ Publisher whitelist — only Nami/Nasus publishers allowed
- ✅ Audit log for all write actions
- ✅ `.env.local` in `.gitignore`

## Deployment (Railway / Vercel)

1. Set all env vars in platform dashboard
2. Change `DATABASE_URL` to PostgreSQL connection string
3. Update `GOOGLE_REDIRECT_URI` to production domain
4. Run `npm run db:migrate` on deploy
