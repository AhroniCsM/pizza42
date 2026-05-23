# 🍕 Pizza 42

> Modern online ordering for a national pizza chain — built on React, FastAPI, and Auth0.

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Auth0](https://img.shields.io/badge/Auth0-Identity-EB5424?logo=auth0&logoColor=white)](https://auth0.com)
[![Kubernetes](https://img.shields.io/badge/Kubernetes-EKS-326CE5?logo=kubernetes&logoColor=white)](https://kubernetes.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Pizza 42 is a customer-facing ordering application that lets registered users
browse a pizza menu, place orders, and view their order history. The entire
identity layer — authentication, authorization, signup, social login, email
verification, and customer profile enrichment — is delegated to [Auth0](https://auth0.com).

---

## Why this exists

Identity is one of the highest-leverage layers in a consumer app, and one of the
easiest to get wrong. Pizza 42 needed a system that:

- **Never stores credentials in our own infrastructure** (security & compliance)
- **Offers a frictionless signup and login** (conversion)
- **Lets new customers join via Google or email/password** (convenience)
- **Enforces email verification before transactions** (trust & data hygiene)
- **Enriches every customer interaction with profile + behavioral data** (marketing)
- **Scales from one location to nationwide rollout** (growth)

Auth0 solves all of those concerns. Pizza 42's engineering team writes pizza
ordering code; Auth0 handles everything related to identity.

---

## Features

| Capability | Powered by |
|---|---|
| Sign up + Sign in (email/password) | Auth0 Database Connection |
| Sign in with Google (social) | Auth0 Social Connection |
| Hosted login — no passwords ever touch the app | Auth0 Universal Login |
| Email verification required before placing an order | Auth0 + custom backend gate |
| Order placement requires a valid token and `create:orders` scope | Auth0 RBAC + custom permission |
| Orders persisted to the customer's identity profile | Auth0 `app_metadata` via Management API |
| Order history available in the ID token at every login | Auth0 Post-Login Action (custom claims) |
| Loyalty tiers (Newbie / Regular / VIP / Legend) computed at login | Auth0 Post-Login Action |
| Step-up MFA for sensitive operations | Auth0 Actions |
| AI-assistant pattern with scoped, revocable agent identity | Auth0 M2M + custom claims |

---

## Architecture

```
┌─────────────────────┐        ┌────────────────────────┐        ┌─────────────────────┐
│   React SPA         │  ──→   │  Auth0 (Universal      │        │  Pizza 42 Backend   │
│   (browser)         │        │  Login + JWT issuer)   │        │  (FastAPI)          │
│                     │  ←──   │                        │        │                     │
│  • Menu             │  JWT   │  • Database Conn       │        │  • Validates JWT    │
│  • Order            │        │  • Google Social       │        │    (RS256 / JWKS)   │
│  • Profile          │        │  • Email verification  │        │  • Email gate       │
│  • Orders history   │        │  • Actions             │        │  • Permission check │
└─────────────────────┘        │  • RBAC                │  ←──→  │  • Mgmt API client  │
        │                      └────────────────────────┘  M2M   └─────────────────────┘
        │                                                                  │
        └──────────────── Bearer <access_token> ───────────────────────────┘
```

- **Stateless authentication** — every backend request validates a JWT independently using Auth0's published public keys (JWKS). No session store, no Redis, no shared secrets.
- **Defense in depth** — the order endpoint requires (1) a valid signed token, (2) the `create:orders` permission, and (3) a verified email confirmed against the live Auth0 profile.
- **Per-customer state** — order history lives in Auth0's `app_metadata` keyed to the user's identity, so it's available to every microservice that validates the token.

---

## Tech stack

**Frontend**
- React 19 + Vite 8
- React Router 7
- `@auth0/auth0-react` (official SDK, PKCE flow with refresh-token rotation)

**Backend**
- FastAPI (Python 3.12)
- `python-jose` for JWT validation
- `httpx` for outbound Management API calls

**Identity**
- Auth0 (Okta Customer Identity Cloud)
- 1 SPA application + 1 custom API + 2 M2M applications (backend, AI agent)
- 2 Post-Login Actions (custom claims, order-history injection)

**Infrastructure**
- Docker (multi-stage: Vite build + nginx + uvicorn under supervisor)
- Kubernetes on AWS EKS
- Container images in AWS ECR

---

## Project structure

```
.
├── src/                  # React frontend
│   ├── components/       # MenuPage, OrdersPage, ProfilePage, TierLadder, AgentPage
│   ├── App.jsx           # Top-level routing, Auth0Provider
│   └── main.jsx          # Auth0 SDK configuration
├── backend/              # FastAPI backend
│   ├── main.py           # JWT validation, /api/orders, Management API client
│   └── requirements.txt
├── auth0/
│   └── actions/          # Post-Login Action source (deploy via Mgmt API)
├── k8s/                  # Kubernetes manifests
│   ├── deployment.yaml
│   ├── service.yaml
│   └── secret.example.yaml
├── Dockerfile            # Multi-stage build (Vite + nginx + uvicorn)
├── nginx.conf            # SPA + /api/* proxy
└── README.md
```

---

## Auth0 Actions

Both Post-Login Actions live in version control under `auth0/actions/`. They
can be deployed to Auth0 via the Management API:

### `Add Custom Claims`
Computes the customer's loyalty tier (NEWBIE / REGULAR / VIP / LEGEND) based on
login count, and injects it as a custom claim into the ID and access tokens.
Marketing changes the threshold without an app deploy.

### `Inject Order History`
Reads `event.user.app_metadata.orders` and adds it to the ID token at every
login. The frontend renders the order history with zero additional API calls.

---

## API reference

| Method | Endpoint | Authentication | Description |
|---|---|---|---|
| `GET` | `/api/orders` | Bearer token | Returns the user's order history from `app_metadata` |
| `POST` | `/api/orders` | Bearer + `create:orders` scope + verified email | Creates a new order and persists to `app_metadata` |
| `POST` | `/api/profile/resend-verification` | Bearer token | Triggers an Auth0 verification email |

---

## Security model

- **Passwords never touch Pizza 42's infrastructure.** They are entered exclusively on Auth0's domain. Even an XSS vulnerability in our frontend cannot leak credentials.
- **Tokens are short-lived (5 min)** with rotating refresh tokens. If a refresh token leaks, Auth0 detects the reuse on the next legitimate refresh and revokes the entire session family.
- **The `email_verified` check happens against the live Auth0 profile**, not just the token, so a stale token cannot bypass the gate.
- **M2M credentials are stored as Kubernetes Secrets**, never in source code, never in the bundled frontend.
- **All identity events are audit-logged** by Auth0 (`Monitoring > Logs` in the dashboard).

---

## License

MIT
