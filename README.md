# Hayat Pharmacy Management System

A full-stack web application for pharmacy operations: inventory, user and role management,
supplier/supply orders, point-of-sale, financial reporting, and real-time notifications.

---

## 🛠 Tech Stack

### Backend
- **Framework:** .NET 9 Web API (ASP.NET Core)
- **ORM:** Entity Framework Core 9 (SQL Server)
- **Auth:** ASP.NET Core Identity + JWT Bearer
- **Validation & Mapping:** FluentValidation, AutoMapper
- **Real-time:** SignalR
- **API docs:** Swagger / OpenAPI (Development only)

### Frontend
- **Build tool:** Vite 8 (replaced the end-of-life Create React App toolchain)
- **Framework:** React 19 + TypeScript 5
- **UI:** Tailwind CSS, MUI, Lucide React
- **HTTP / real-time:** Axios, `@microsoft/signalr`
- **Routing:** React Router v7
- **Notifications:** React Hot Toast

### Testing
- **Backend:** xUnit + Moq + EF Core InMemory
- **Frontend:** Vitest + React Testing Library
- **End-to-end:** Playwright (Chromium)

---

## ✨ Features

- **Role-based access** — Admin, Pharmacist, StorageManager. Enforced server-side on every
  endpoint, not just hidden in the UI.
- **Medicine & category management** with soft delete, visibility toggles and image upload.
- **Point of sale** with cart, checkout, invoice, and atomic stock deduction that cannot oversell.
- **Supply order workflow** — Created → Approved → Ordered → Shipped → Received → Stored.
  Admin owns the ordering stages; StorageManager owns physical receipt. Storing an order
  increases inventory and updates weighted-average cost.
- **Finance & profit reporting (Admin only)** — revenue, COGS, gross profit and margin,
  inventory value at cost and retail, potential profit, best sellers, daily revenue trend.
- **Cost-plus price suggestion** using configurable regressive markup tiers.
- **Real-time notifications** over SignalR, scoped per role.

---

## 📁 Project Structure

```
Hayat.sln
├── Backend/                 ASP.NET Core Web API
│   ├── Controllers/         HTTP endpoints
│   ├── Services/            Business logic
│   ├── Interfaces/          Service contracts
│   ├── Models/              EF Core entities
│   ├── Dtos/                Request/response shapes
│   ├── Validators/          FluentValidation rules
│   ├── Configurations/      EF + strongly-typed settings
│   ├── Hubs/                SignalR (NotificationsHub)
│   ├── Migrations/          EF Core migrations
│   └── Data/                DbContext + initializer
├── Backend.Tests/           xUnit unit tests
└── frontend/                React + TypeScript SPA
    ├── src/Pages/           Role dashboards
    ├── src/Components/      Shared UI
    ├── src/Services/        API clients
    ├── src/hooks/           Reusable hooks (incl. useSignalR)
    └── e2e/                 Playwright specs
```

---

## 🚀 Getting Started

### Prerequisites
- .NET SDK 9.0+
- Node.js 20+
- SQL Server (LocalDB, Express or full)

### 1. Backend configuration

**No secrets are committed.** Configuration is supplied via .NET user-secrets locally, or
environment variables in deployed environments.

```bash
cd Backend
dotnet user-secrets init
dotnet user-secrets set "ConnectionStrings:DefaultConnection" "Data Source=.;Initial Catalog=Hayat;Integrated Security=True;Encrypt=False;TrustServerCertificate=True;"
dotnet user-secrets set "JwtSettings:Key"      "<a long random secret, 32+ chars>"
dotnet user-secrets set "JwtSettings:Issuer"   "hayat-api"
dotnet user-secrets set "JwtSettings:Audience" "hayat-client"
```

Generate a key with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

#### Required configuration

| Key | Required | Purpose |
|---|---|---|
| `ConnectionStrings:DefaultConnection` | ✅ | SQL Server connection string |
| `JwtSettings:Key` | ✅ | JWT signing key (32+ chars). **Rotate if ever exposed.** |
| `JwtSettings:Issuer` | ✅ | Expected token issuer |
| `JwtSettings:Audience` | ✅ | Expected token audience |
| `JwtSettings:ExpiryHours` | Optional | Token lifetime, default **8** (a working shift), clamped to 1-24. The old 2-hour default expired mid-shift. |
| `Cors:AllowedOrigins` | ✅ outside Development | Array of allowed frontend origins. The app **refuses to start** in non-Development without it. Never `*` — SignalR requires credentials. |
| `BootstrapAdmin:UserName` / `:Email` / `:Password` | Optional | Creates the first Admin **only** on an empty database. Omit once an Admin exists. |
| `Pricing:*` | Optional | Markup tiers, dispensing fee (see below) |

Environment-variable form uses double underscores, e.g.
`JwtSettings__Key`, `ConnectionStrings__DefaultConnection`, `Cors__AllowedOrigins__0`.

### 2. Database

```bash
dotnet ef database update --project Backend
```

The API does **not** auto-migrate on startup — run this explicitly on deploy.

### 3. First admin

A fresh database has no users, and every user-management endpoint requires an Admin. Seed one:

```bash
cd Backend
BootstrapAdmin__UserName=admin \
BootstrapAdmin__Email=admin@example.com \
BootstrapAdmin__Password='ChangeMe#2026' \
dotnet run
```

Sign in, create the real accounts, then **remove those variables and change the password**.

### 4. Run

```bash
# API  -> http://localhost:5057 (Swagger at /swagger in Development)
cd Backend && dotnet run

# SPA  -> http://localhost:3000
cd frontend && npm install && npm start
```

Copy `frontend/.env.example` to `frontend/.env` and point `REACT_APP_API_BASE` at the API.

---

## 💰 Pricing configuration

Retail prices are cost-plus with a **regressive** markup — a higher percentage on cheap items,
lower on expensive ones, which is what regulated pharmacy markets use. A flat percentage
over-prices expensive drugs and under-earns on cheap essentials.

```
Selling price = cost + (cost × markup%) + dispensing fee
```

Markup is a percentage **of cost**, not of the sell price — a 25% markup is a 20% margin.

Defaults in `appsettings.json` (tune to your market):

| Unit cost | Markup |
|---|---|
| ≤ 10 | 40% |
| ≤ 50 | 25% |
| ≤ 200 | 15% |
| above | 10% (`DefaultMarkupPercent`) |

`GET /api/Stats/suggest-price?cost=25` returns the suggested price. Prices are **not** set
automatically — the suggestion is advisory and the Admin remains in control.

**Cost tracking:** a medicine's `CostPrice` is a weighted average, recalculated whenever a
supply order reaches **Stored**. Each sale snapshots the cost onto the order line, so
historical profit stays correct even after supplier costs change. Medicines that never went
through a supply order have no cost, and the Finance page explicitly says how much revenue
that affects rather than reporting a misleading 100% margin.

---

## 🧪 Testing

```bash
# Backend unit tests
dotnet test Hayat.sln

# Frontend unit tests
cd frontend && npm test

# Typecheck / lint
cd frontend && npm run typecheck && npm run lint

# End-to-end (needs API on :5057 and SPA on :3000)
cd frontend && npm run build && npm run preview   # serves the build on :3000
cd frontend && npm run e2e
```

Playwright creates its own role accounts via the API. On a fresh database, start the API with
`BootstrapAdmin:*` configured, or point the suite at an existing admin:

```bash
E2E_BOOTSTRAP_USER=admin E2E_BOOTSTRAP_PASS='...' npx playwright test
```

---

## 📦 Deployment checklist

- [ ] `ConnectionStrings:DefaultConnection` set for the target environment
- [ ] `JwtSettings:Key` is a fresh, long random value — **never reuse a key that has been in source control**
- [ ] `Cors:AllowedOrigins` set to the real frontend origin(s); never `*`
- [ ] `ASPNETCORE_ENVIRONMENT=Production` (this disables Swagger)
- [ ] `dotnet ef database update` run against the target database
- [ ] An Admin account exists; `BootstrapAdmin:*` removed afterwards
- [ ] HTTPS enforced at the host/reverse proxy
- [ ] `frontend/.env` `REACT_APP_API_BASE` points at the deployed API
- [ ] `npm run build` output served as a SPA (all unknown paths → `index.html`)
- [ ] `Backend/wwwroot/images/medicines` is writable and persisted (uploaded images live there)

### Build & publish

```bash
# API
dotnet publish Backend/Backend.csproj -c Release -o ./publish

# SPA
cd frontend && npm ci && npm run build   # output in frontend/build
```

`npm run build` runs `tsc --noEmit` first, so a type error fails the build rather than
shipping.

---

## 🔐 Security notes

- Passwords are hashed by ASP.NET Core Identity (PBKDF2-HMAC-SHA256).
- Login uses `SignInManager.CheckPasswordSignInAsync` with lockout: 5 failed attempts → 15 minutes.
- Login failures return one generic message so usernames cannot be enumerated.
- Purchase cost and all financial reporting are Admin-only.
- Uploaded images are restricted by extension **and** content type, capped at 5 MB, and stored
  under a generated GUID filename.
- JWTs are held in `localStorage`, which is readable by any successful XSS. Moving to
  httpOnly cookies would be an improvement if the threat model warrants it.
- Sessions end cleanly: the client refuses to send an expired token, any 401 clears the
  session, and the user is redirected to the login page with an explanation.

### Known advisory with no available fix

`npm audit` reports one advisory against `react-router` (*RSC Mode CSRF Bypass*,
affecting `>=7.12.0 <8.3.0`). **No fixed version exists** - 7.18.2 is the latest
published release and 8.3.0 is not out. It does not apply here: this is a client-only
SPA using `createBrowserRouter` with no RSC, server actions, loaders or SSR.

Do **not** take `npm audit`'s advice to "fix" it by downgrading to 7.11.0 - that
version carries 14 advisories, including XSS and an RCE-class deserialization issue,
several of which *do* apply to this app. 7.18.2 is the safest available version.
