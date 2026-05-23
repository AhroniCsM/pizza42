# POC — Pizza 42 × Auth0

How each requirement is satisfied, with direct pointers to the code in this
repository and the Auth0 dashboard surface that drives it.

> **Live app**: https://pizza42-aharon.fly.dev
> **Repository**: https://github.com/AhroniCsM/pizza42

---

## Business pain → Auth0 capability → where in the repo

| Pizza 42 stakeholder | Auth0 capability | Code reference |
|---|---|---|
| 🛡️ "Storing passwords is a liability" | **Universal Login** (hosted on Auth0's domain) | [src/main.jsx#L8-L29](https://github.com/AhroniCsM/pizza42/blob/main/src/main.jsx#L8-L29) |
| 🎨 "Frictionless signup + password reset" | Hosted Universal Login with `screen_hint: 'signup'` and built-in password reset | [src/App.jsx#L67-L80](https://github.com/AhroniCsM/pizza42/blob/main/src/App.jsx#L67-L80) |
| 🎨 "Let customers use Google" | Auth0 Social Connection (Google) — dashboard toggle | Dashboard: `Authentication > Social > Google` |
| 📊 "Enrich customer data at login" | Post-Login Action injects tier, login count, order history into the JWT | [auth0/actions/add-custom-claims.js](https://github.com/AhroniCsM/pizza42/blob/main/auth0/actions/add-custom-claims.js) · [auth0/actions/inject-order-history.js](https://github.com/AhroniCsM/pizza42/blob/main/auth0/actions/inject-order-history.js) |
| 🛡️ "Order placement needs an extra check" | Backend checks `create:orders` scope and live `email_verified` from Management API | [backend/main.py#L200-L261](https://github.com/AhroniCsM/pizza42/blob/main/backend/main.py#L200-L261) |

---

## Task requirements → implementation

### ✅ 1. Auth0 trial + explore Applications, APIs, Database, Social

Auth0 tenant configured: `dev-daz2luy7lq0sm8ba.us.auth0.com`.

| Auth0 object | Purpose |
|---|---|
| Application: Pizza 42 Web (SPA) | The React frontend client |
| API: `auth0-learning-api` | Protected resource, audience `https://auth0-learning-api`, RBAC enabled, RS256 |
| M2M: Pizza 42 Backend | Server-side credentials for Management API calls |
| Database Connection: Username-Password-Authentication | Built-in email/password store |
| Social Connection: Google | One-click signin |

### ✅ 2. Single-Page App (SPA) option

Vite SPA using the official `@auth0/auth0-react` SDK. Auth0 enforces PKCE Authorization Code flow.

→ [src/main.jsx#L8-L29](https://github.com/AhroniCsM/pizza42/blob/main/src/main.jsx#L8-L29)

### ✅ 3. JavaScript framework option (React)

React 19 + Vite + React Router. The whole app is wrapped in `<Auth0Provider>`.

→ [package.json](https://github.com/AhroniCsM/pizza42/blob/main/package.json) · [src/main.jsx#L21-L23](https://github.com/AhroniCsM/pizza42/blob/main/src/main.jsx#L21-L23)

### ✅ 4. Login

`loginWithRedirect()` sends the user to Auth0 Universal Login. The SDK then handles the auth-code exchange and token storage.

→ [src/App.jsx#L75](https://github.com/AhroniCsM/pizza42/blob/main/src/App.jsx#L75) (Log In button)
→ [src/App.jsx#L71](https://github.com/AhroniCsM/pizza42/blob/main/src/App.jsx#L71) (Sign Up button — uses `screen_hint: 'signup'`)

### ✅ 5. Call an API

The React app attaches the access token as a Bearer header. The FastAPI backend validates the JWT against Auth0's JWKS endpoint on every request.

→ Frontend call: [src/components/MenuPage.jsx#L88-L99](https://github.com/AhroniCsM/pizza42/blob/main/src/components/MenuPage.jsx#L88-L99)
→ Backend JWT validation: [backend/main.py#L48-L91](https://github.com/AhroniCsM/pizza42/blob/main/backend/main.py#L48-L91)

### ✅ 6. Sign up / sign in with email/password OR social

Both options surface on the Universal Login page.

| Method | Configured in Auth0 |
|---|---|
| Email / password | Database Connection enabled on the SPA |
| Google | Social Connection enabled on the SPA |
| Passkey | Authentication Methods tab on the Database Connection |

Authentication Profile set to **Identifier First** so Auth0 can show the right options per user.

### ✅ 7. Email verification required before placing an order — but never blocks login

Login is never blocked. The verification check fires only on order placement and is performed against the **live Auth0 profile** via Management API, not the cached JWT claim.

→ Backend live check: [backend/main.py#L216-L237](https://github.com/AhroniCsM/pizza42/blob/main/backend/main.py#L216-L237)
→ Frontend banner: [src/components/MenuPage.jsx#L116-L121](https://github.com/AhroniCsM/pizza42/blob/main/src/components/MenuPage.jsx#L116-L121)
→ Frontend self-heal (drops the banner the moment the live profile reports verified): [src/components/MenuPage.jsx#L72-L99](https://github.com/AhroniCsM/pizza42/blob/main/src/components/MenuPage.jsx#L72-L99)

### ✅ 8. Order endpoint requires valid token + specific scope

Custom permission `create:orders` added to the API. The SPA requests it in the authorization request. The backend rejects requests that don't carry it.

| Where | What |
|---|---|
| Auth0 dashboard | `Applications > APIs > auth0-learning-api > Permissions` — `create:orders` defined |
| SDK | Scope requested in [src/main.jsx#L16](https://github.com/AhroniCsM/pizza42/blob/main/src/main.jsx#L16) |
| Backend gate | [backend/main.py#L200-L211](https://github.com/AhroniCsM/pizza42/blob/main/backend/main.py#L200-L211) |
| Role wiring | A "user" role carries `create:orders`; Post-Login Action assigns it to new customers automatically |

### ✅ 9. Order saved to the user's Auth0 profile

The backend uses M2M credentials to PATCH the user's `app_metadata.orders` array via the Management API. Order history lives on the identity object itself.

→ [backend/main.py#L186-L198](https://github.com/AhroniCsM/pizza42/blob/main/backend/main.py#L186-L198) (PATCH helper)
→ [backend/main.py#L240-L261](https://github.com/AhroniCsM/pizza42/blob/main/backend/main.py#L240-L261) (order endpoint that calls it)

M2M credentials injected via Fly Secrets (or Kubernetes Secrets in dev). Never in source.

→ [k8s/secret.example.yaml](https://github.com/AhroniCsM/pizza42/blob/main/k8s/secret.example.yaml)

### ✅ 10. Order history added to the ID token on login

A Post-Login Action reads `event.user.app_metadata.orders` and injects it into the ID token as a namespaced custom claim. The frontend renders the order history, stats dashboard, and reorder UX **with zero post-login API calls**.

→ Action source: [auth0/actions/inject-order-history.js](https://github.com/AhroniCsM/pizza42/blob/main/auth0/actions/inject-order-history.js)
→ Frontend reads claim directly: [src/App.jsx#L11](https://github.com/AhroniCsM/pizza42/blob/main/src/App.jsx#L11) (claim name) · [src/App.jsx#L37](https://github.com/AhroniCsM/pizza42/blob/main/src/App.jsx#L37) (reads from `user` object)

---

## Implementation summary by layer

| Layer | What's in there |
|---|---|
| **Auth0 tenant** | 1 SPA application · 1 custom API · 2 M2M applications · Database Connection · Google Social Connection · 2 Post-Login Actions · RBAC with "Add Permissions in Access Token" · Refresh Token Rotation with reuse detection |
| **Frontend** | React 19 + Auth0 React SDK · OAuth 2.0 Authorization Code flow with PKCE · refresh-token rotation cached in `localStorage` · ID-token-driven UI (zero post-login API calls to render the dashboard, order history, or tier badge) |
| **Backend** | FastAPI · RS256 JWT validation via Auth0's JWKS · audience + issuer + expiry checks · scope enforcement on the protected endpoint · live `email_verified` check against Management API · cached M2M tokens to minimise round trips |
| **Infrastructure** | Multi-stage Docker image (Vite build → nginx + uvicorn under supervisor) · deployed on Fly.io with always-on machine · HTTPS terminated at the edge · M2M credentials injected as Fly secrets |

---

## Design decisions worth highlighting

### Orders persisted in `app_metadata` — surfaced via the ID token
For this POC, persisting orders in the identity profile shows that the identity layer can carry behavioural data the rest of the app reacts to. In a real Pizza 42 rollout, the authoritative order ledger lives in an OLTP database; only the **last N order summaries** are cached in `app_metadata` for personalisation and instant-render.

### `email_verified` is checked against the live Auth0 profile, not the token
A token issued *before* the user verified could otherwise bypass the gate. Fetching the live profile via Management API on every order placement makes the verification check authoritative. The frontend banner is UX polish; the real security is server-side.

### Custom claims are namespaced with a URL
OIDC reserves un-namespaced claim names. Auth0 enforces a URL namespace (`https://pizza42.com/orders`) to prevent collisions with standard JWT claims.

### The `user` role is auto-assigned on first login, not at signup
Moving role assignment into the Post-Login Action — rather than Post-User-Registration — guarantees the role is in place before any authenticated request. Social signups (Google, GitHub) and email/password signups are handled identically. Brand-new customers whose first token was issued before the role was assigned are covered by a transparent token-refresh retry on the frontend.

### Trusted social providers auto-verify the email
Google, GitHub, Apple, Microsoft, Facebook all verify their users' emails as part of their own onboarding. Forcing a Pizza 42 customer who logged in via Google to re-verify would be friction with no security benefit. The Action sets `email_verified: true` for users coming from a trusted social strategy. Email/password signups still go through the standard verification flow.

### Stateless backend = no auth bottleneck at scale
Every request carries its own JWT, validated locally by the backend using Auth0's published public keys (cached in memory). Adding a tenth backend instance requires no coordination with the identity layer.

### M2M credentials never leave the server
The frontend bundle contains only the public SPA client ID and API audience. The Management API client_secret lives in Fly secrets and is only read by the backend process. Same boundary that protects Pizza 42's database credentials.
