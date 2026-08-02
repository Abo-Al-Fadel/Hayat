# Deploying Hayat Pharmacy

Three pieces, each on a free plan:

| Piece | Host | Free plan |
|---|---|---|
| Database (SQL Server) | Azure SQL Database — free offer | 32 GB + 100,000 vCore-seconds a month, for the lifetime of the subscription |
| API (.NET 9) | Render — Web Service from `Dockerfile` | 750 instance-hours a month, no card required |
| Frontend (React) | Cloudflare Pages *(or Netlify / Vercel)* | Unlimited static requests |

Total cost: nothing. One real caveat, covered in step 2: a free Render service **sleeps after 15 minutes idle**, and the next request takes 30–60 seconds while it wakes.

Work through the steps in order — step 3 needs the database from step 1, and step 4 needs the API URL from step 3.

---

## Before you start

**Rotate the JWT signing key.** The old key was committed to this repository's history and must be treated as public. Full instructions are in [Rotating the JWT key](#rotating-the-jwt-key) — do it before the first deploy, not after.

Generate the values you will paste into the host later:

```bash
# Signing key — 64 bytes of real randomness
openssl rand -base64 48
```

No OpenSSL on Windows? PowerShell:

```powershell
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Max 256 }))
```

Keep this somewhere safe. It is the only thing standing between a stranger and an Admin token.

---

## 1. Database — Azure SQL free offer

1. Sign in at <https://portal.azure.com> (a free account is enough; no spend is required for this tier).
2. **Create a resource → SQL Database**.
3. Create a new server. Note the **server name**, **admin login** and **admin password** — the password is not shown again.
4. On the **Compute + storage** step choose **Apply free offer**. It must read *General Purpose — Serverless*, 32 GB. If you do not select this, the database is billable.
5. Set **Backup storage redundancy** to *Locally redundant* — the cheapest, and enough here.
6. Create the database, then open it → **Networking** → tick **Allow Azure services and resources to access this server**, and add your own IP so you can connect from your machine.
7. Open **Connection strings → ADO.NET** and copy it. Replace `{your_password}` with the real password.

You should end up with something like:

```
Server=tcp:hayat-sql.database.windows.net,1433;Initial Catalog=hayat;Persist Security Info=False;User ID=hayatadmin;Password=REPLACE_ME;MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;
```

> **You do not need to create any tables.** The API applies its own migrations on first start and logs `Applying N pending migration(s)`. Verified against an empty database: 22 migrations, 18 tables.

> **Serverless auto-pause:** the free tier pauses the database after an hour of inactivity, and the first query afterwards takes ~30 seconds while it resumes. Combined with Render sleeping, a cold visit can take a minute. That is the price of free; see [If free is too slow](#if-free-is-too-slow).

---

## 2. Push the code to GitHub

Render deploys from a repository.

```bash
git remote add origin https://github.com/<you>/<repo>.git   # if not already set
git push -u origin main
```

Two things to confirm before you push:

- `git log -p | grep -i "Password=\|JwtSettings"` returns nothing meaningful. The history was already scrubbed of the old key and connection string.
- The repository can be **public** safely once the key is rotated — every secret is read from the environment, and `appsettings.json` ships with empty values. If you would rather not think about it, make it private.

---

## 3. API — Render

1. <https://dashboard.render.com> → **New → Web Service** → connect the repository.
2. Render detects the `Dockerfile` at the repository root. Confirm:
   - **Language / Runtime:** Docker
   - **Dockerfile path:** `./Dockerfile`
   - **Instance type:** Free
   - **Health check path:** `/health`
3. Add the environment variables below (**Environment → Add Environment Variable**). Mark the key and the connection string as **secret**.

| Name | Value |
|---|---|
| `ASPNETCORE_ENVIRONMENT` | `Production` |
| `ConnectionStrings__DefaultConnection` | the Azure string from step 1 |
| `JwtSettings__Key` | the 64-byte key you generated |
| `JwtSettings__Issuer` | `hayat-api` |
| `JwtSettings__Audience` | `hayat-client` |
| `Cors__AllowedOrigins__0` | your frontend URL, e.g. `https://hayat.pages.dev` — **no trailing slash** |
| `BootstrapAdmin__UserName` | e.g. `admin` |
| `BootstrapAdmin__Email` | your email |
| `BootstrapAdmin__Password` | a strong password, 8+ chars with upper, lower, digit and symbol |

The double underscore is not a typo — it is how .NET maps an environment variable onto nested configuration.

4. Deploy. Watch the log for `Now listening on:` and `Applying N pending migration(s)`.
5. Check it: `https://<your-service>.onrender.com/health` should return `{"status":"ok",...}`.

### Things the app will refuse to start with

These are deliberate — a misconfigured deploy fails loudly instead of running insecurely.

| Log message | Cause |
|---|---|
| `JwtSettings:Key is not configured` | `JwtSettings__Key` missing |
| `JwtSettings:Key is a known-compromised value` | you pasted the old committed key |
| `JwtSettings:Key must be at least 32 bytes` | key too short for HMAC-SHA256 |
| `JwtSettings:Key has too little variety` | not actually random |
| `Cors:AllowedOrigins must be configured outside Development` | `Cors__AllowedOrigins__0` missing |

### About `BootstrapAdmin`

It creates the first Admin **only when the user table is completely empty**, so it cannot be used to add an account later or to overwrite anyone. Once you have signed in and created your real accounts, delete the three `BootstrapAdmin__*` variables and redeploy — it is a bootstrap, not a standing credential.

---

## 4. Frontend — Cloudflare Pages

1. <https://dash.cloudflare.com> → **Workers & Pages → Create → Pages → Connect to Git**.
2. Build settings:
   - **Framework preset:** None
   - **Build command:** `npm run build`
   - **Build output directory:** `build`
   - **Root directory:** `frontend`
3. Environment variable: `REACT_APP_API_BASE` = `https://<your-service>.onrender.com` (no trailing slash).
4. Deploy, then copy the resulting `*.pages.dev` URL.
5. **Go back to Render** and set `Cors__AllowedOrigins__0` to that exact URL, then redeploy the API.

Step 5 is the one everyone forgets. Symptom: the site loads but every request fails, and the browser console says the response was blocked by CORS. The origin must match scheme, host and port exactly, with no trailing slash.

> Netlify and Vercel work identically — same build command, same output directory, same variable.

---

## 5. Check the deployment

In the browser, signed in as the bootstrap Admin:

- [ ] Login works and lands on the Admin panel
- [ ] Products, Orders, Stocks, Users and Statistics all load
- [ ] The order calendar shows the current month with today ringed
- [ ] Creating a Pharmacist works, and that account can only see the Pharmacist dashboard
- [ ] Notifications arrive live (SignalR) — place a supply order and watch the bell
- [ ] The layout holds on a phone

From a terminal:

```bash
API=https://<your-service>.onrender.com

curl -s $API/health                       # {"status":"ok",...}
curl -s -o /dev/null -w "%{http_code}\n" $API/api/Medicine        # 401 — no anonymous access
curl -s -o /dev/null -w "%{http_code}\n" $API/swagger/index.html  # 404 — Swagger is off in Production
```

If all three match, the API is configured correctly.

---

## Rotating the JWT key

**Do this before the first deploy.** The key `HayaaPharmacyMostSecretKeyEverCreated!` was committed to this repository. Anyone who has ever seen that history — or who simply guesses it, because it is a guessable phrase — can forge a token for any role, including Admin. Removing it from history does not un-leak it; only a new key does. The app now refuses to start with that value, in any environment.

### What rotating does

Every JWT is signed with this key. Change it and every existing token stops validating, so **everyone is signed out and signs in again**. Nothing else is lost — passwords, orders and stock are untouched.

### Steps

1. **Generate a new key.** 48 random bytes, base64-encoded (64 characters):

   ```bash
   openssl rand -base64 48
   ```

   ```powershell
   # PowerShell
   [Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Max 256 }))
   ```

   Do not invent one by hand. `MyPharmacySecretKey2026!` is exactly the kind of key the startup check rejects.

2. **Set it where the app runs.**

   *Render:* Environment → edit `JwtSettings__Key` → Save. Render redeploys on its own.

   *Locally:*
   ```bash
   cd Backend
   dotnet user-secrets set "JwtSettings:Key" "<the new key>"
   ```

   Never put it in `appsettings.json`. That file is committed; the whole point is that the key is not.

3. **Restart the API** if the host did not. Watch for a clean start with no `JwtSettings:Key` error.

4. **Sign in again.** Existing sessions get a 401, and the app sends them to `/login?reason=expired` with an explanation rather than a blank screen.

5. **Tell anyone else using it** that they need to sign in again.

### How often

Rotate on a schedule you will actually keep — every 90 days is a reasonable habit — and **immediately** if the key is pasted into a chat, a screenshot, a log, or a commit.

### Checking it took

```bash
# An old token must now be rejected.
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer <a token from before the rotation>" \
  https://<your-service>.onrender.com/api/Medicine
# 401
```

---

## What is not free, and what to do about it

**Uploaded medicine images.** They are written to `wwwroot/uploads` inside the container. Render's filesystem is ephemeral, so images vanish on every redeploy. Options, cheapest first:

1. Accept it — images are decoration, and the catalogue still works.
2. Attach a Render **Persistent Disk** at `/app/wwwroot/uploads` (paid, from a few dollars a month).
3. Move uploads to object storage (Cloudflare R2 has a free tier). Needs a code change in the image handler.

**Backups.** Azure SQL takes automatic backups on the free tier with a 7-day retention. That covers accidental deletion, not an accidental `DROP`. Take your own before anything risky:

```bash
# From Azure Portal: Database → Export → to a storage account (.bacpac)
```

---

## If free is too slow

The sleeping and auto-pause behaviour is the only real downside. Cheapest fixes:

| Problem | Fix | Cost |
|---|---|---|
| API sleeps after 15 min | Render Starter instance | ~$7/month |
| API sleeps after 15 min | An uptime pinger hitting `/health` every 10 min | free, but burns the 750 monthly hours in ~31 days — it will run out |
| Database pauses after 1 hr | Azure SQL Basic tier | ~$5/month |

The pinger is a false economy: 750 hours is 31.25 days, so a service kept permanently awake gets suspended near the end of every month. If uptime actually matters, pay for the instance.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| First visit takes ~60s | Render sleeping + Azure resuming | Expected on free. Wait it out. |
| Everything fails with a CORS error | `Cors__AllowedOrigins__0` does not match the frontend URL exactly | Match scheme and host, drop the trailing slash, redeploy the API |
| Login returns 500 | Database unreachable | Azure SQL → Networking → allow Azure services; check the password in the connection string |
| `Failed to load products` | Schema behind the code | The API migrates on start — check the deploy log for a migration error |
| Redirect loop | Proxy headers not trusted | Already handled by `UseForwardedHeaders`; if you added a second proxy, it must forward `X-Forwarded-Proto` |
| Notifications never arrive | WebSockets blocked by CORS | SignalR needs credentialed CORS, so the origin must be listed explicitly — `*` will not work |
| Deploy fails on `JwtSettings:Key` | Key missing, compromised, short, or not random | Generate a new one with `openssl rand -base64 48` |
| Can't sign in at all after deploying | `BootstrapAdmin__*` unset on an empty database | Set the three variables and redeploy; they only apply when no user exists |

---

## Local development

```bash
# API
cd Backend
dotnet user-secrets set "ConnectionStrings:DefaultConnection" "Server=(localdb)\\mssqllocaldb;Database=Hayat;Trusted_Connection=True;"
dotnet user-secrets set "JwtSettings:Key" "$(openssl rand -base64 48)"
dotnet user-secrets set "JwtSettings:Issuer" "hayat-api"
dotnet user-secrets set "JwtSettings:Audience" "hayat-client"
dotnet run

# Frontend
cd frontend
npm install
npm start
```

Development mode allows localhost origins automatically, enables Swagger at `/swagger`, and relaxes the key-length check — but never the compromised-key check.

### Tests

```bash
dotnet test                    # 140 backend tests
cd frontend && npm test        # 70 unit tests
cd frontend && npm run e2e     # 119 end-to-end checks (needs both servers running)
```
