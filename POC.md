# POC — Pizza 42 × Auth0

A walkthrough of how each business and technical requirement is implemented,
with direct pointers to source code and Auth0 dashboard configuration.

> **Live demo**: http://a572ceeb22b33486aa37044270c66a53-a70fa9841e68ff97.elb.eu-north-1.amazonaws.com
> **Repository**: https://github.com/AhroniCsM/pizza42

---

## Business pains and how Pizza 42 solves them

| Pizza 42 stakeholder said... | Auth0 capability used | Where in this repo |
|---|---|---|
| 🛡️ *"Storing passwords is a security liability"* | **Universal Login** (hosted) — passwords are entered on Auth0's domain, never on Pizza 42's | `src/main.jsx:10-25` (Auth0Provider) |
| 🎨 *"We want frictionless signup and password reset"* | **Hosted Universal Login**, automatic password-reset flow, social option | `src/App.jsx:71` (Sign Up) `src/App.jsx:75` (Log In) |
| 🎨 *"Customers should be able to use Google"* | **Auth0 Social Connection (Google)** enabled on the SPA | Dashboard → `Authentication > Social > Google` |
| 📊 *"Marketing needs enriched customer data"* | **Post-Login Action** adds tier, login count, login method, and order history to every JWT | `auth0/actions/add-custom-claims.js`, `auth0/actions/inject-order-history.js` |
| 🛡️ *"Order placement requires extra verification"* | **Backend gate** — checks both `create:orders` scope and live `email_verified` flag | `backend/main.py:200-261` |

---

## Task requirements → implementation

### ✅ 1. Sign up for an Auth0 trial; explore Applications, APIs, Database, Social

Created and configured in the Auth0 tenant `dev-daz2luy7lq0sm8ba.us.auth0.com`:

| Object | Purpose |
|---|---|
| **Application: Pizza 42 Web (SPA)** | The React frontend client (Client ID `9MsvwysOmaEtZyc6MnQRRtaHDSxVtAsQ`) |
| **API: auth0-learning-api** | The protected resource with audience `https://auth0-learning-api`, RBAC enabled, RS256 signing |
| **M2M: Pizza 42 Backend** | Server-side credentials for calling the Management API |
| **Database Connection: Username-Password-Authentication** | Built-in email/password user store with bcrypt + breached-password detection |
| **Social Connection: Google** | One-click signin for customers with a Google account |

---

### ✅ 2. Single-Page App (SPA) option

The frontend is built as a Vite SPA. The Auth0 SDK uses PKCE Authorization Code
flow under the hood (mandatory for SPAs — no client secret in the browser).

- **Auth0 dashboard**: Application type set to **Single Page Application**
- **Code**: `src/main.jsx:10-25`

```jsx
<Auth0Provider
  domain={import.meta.env.VITE_AUTH0_DOMAIN}
  clientId={import.meta.env.VITE_AUTH0_CLIENT_ID}
  authorizationParams={{
    redirect_uri: window.location.origin,
    audience: import.meta.env.VITE_AUTH0_API_AUDIENCE,
    scope: "openid profile email offline_access create:orders"
  }}
  useRefreshTokens={true}
  cacheLocation="localstorage"
>
```

`useRefreshTokens` enables refresh-token rotation — short-lived access tokens
(5 min) are silently swapped without forcing the user to re-authenticate.

---

### ✅ 3. JavaScript framework option (React)

Chose React — it's the most common B2C frontend stack and the Auth0 React SDK
is the most mature.

- `package.json` declares React 19 + Vite + `@auth0/auth0-react` + `react-router-dom`
- The whole app is wrapped in `<Auth0Provider>` and routes are managed by `<BrowserRouter>`
  (`src/main.jsx:21`)

---

### ✅ 4. Login portion

The login button calls `loginWithRedirect()` which redirects to the Auth0
Universal Login page. After authentication, Auth0 redirects back with an
authorization code which the SDK silently exchanges for tokens.

**Source:**
- `src/App.jsx:75` — Log In button
- `src/App.jsx:71` — Sign Up button (uses `screen_hint: 'signup'` to open the signup tab directly)

```jsx
<button onClick={() => loginWithRedirect({ authorizationParams: { screen_hint: 'signup' } })}>
  Sign Up
</button>
<button onClick={() => loginWithRedirect()}>
  Log In
</button>
```

---

### ✅ 5. Call an API portion

Every protected backend call attaches the access token as a Bearer header. The
backend validates the JWT against Auth0's published JWKS on every request.

**Frontend** (`src/components/MenuPage.jsx:83`):
```jsx
const token = await getAccessTokenSilently()
const res = await fetch('/api/orders', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: JSON.stringify({ pizza_name, quantity, price }),
})
```

**Backend** (`backend/main.py:58-91`):
```python
def verify_token(credentials: HTTPAuthorizationCredentials = Depends(token_scheme)) -> dict:
    jwks = get_signing_keys()
    payload = jwt.decode(
        token, rsa_key, algorithms=["RS256"],
        audience=AUTH0_AUDIENCE,
        issuer=AUTH0_ISSUER,
    )
    return payload
```

The JWKS public keys are fetched from `https://<tenant>/.well-known/jwks.json`.
No shared secret. Any new microservice can independently verify the same token.

---

### ✅ 6. Sign up / Sign in with email/password OR social provider

Both options are surfaced on the Auth0 Universal Login page:

| Method | Configured in Auth0 |
|---|---|
| Email/password | **Database Connection** `Username-Password-Authentication` (enabled on the SPA) |
| Google | **Social Connection** `google-oauth2` (enabled on the SPA) |
| Passkey (bonus) | **Authentication Methods** tab on the Database Connection — Passkey set to Active |

The application's **Authentication Profile** is set to **Identifier First**, which
allows Auth0 to present the right options for each user after they enter their
email (e.g., "use your passkey", "use Google", or "enter your password").

---

### ✅ 7. Verified email required before placing an order (but not before signin)

Login itself is never blocked — customers can still browse the menu, view their
profile, and access their order history. The check happens **only on order
placement**, and against the **live Auth0 profile** (not just the cached JWT
claim) so the gate cannot be bypassed with a stale token.

**Backend** (`backend/main.py:216-237`):
```python
@app.post("/api/orders")
async def place_order(order, token_payload = Depends(require_create_orders)):
    user_id = token_payload["sub"]
    # Fetch authoritative profile (not just the token claim)
    user_profile = await get_user_full_profile(user_id)
    if not user_profile.get("email_verified", False):
        raise HTTPException(
            status_code=403,
            detail="You must verify your email address before placing an order."
        )
    # ... place order
```

**Frontend** also shows a non-blocking banner reminding the user
(`src/components/MenuPage.jsx:64, 116-121`):
```jsx
const isEmailVerified = user?.email_verified === true
{isAuthenticated && !isEmailVerified && (
  <div className="verify-banner">⚠️ Please verify your email…</div>
)}
```

---

### ✅ 8. Order endpoint requires valid token + specific scope

A custom permission `create:orders` was added to the API. The SPA requests it in
its authorization request, and the backend rejects requests that don't carry it.

**Auth0 configuration**:
- `Applications > APIs > auth0-learning-api > Permissions` — added `create:orders`
- `Application Access` tab — SPA authorized for `create:orders`
- `User Management > Roles > admin` — has `create:orders`

**SDK requests it** (`src/main.jsx:16`):
```jsx
scope: "openid profile email offline_access create:orders"
```

**Backend enforces it** (`backend/main.py:200-211`):
```python
def require_create_orders(token_payload: dict = Depends(verify_token)) -> dict:
    permissions = token_payload.get("permissions", [])
    if "create:orders" not in permissions:
        raise HTTPException(status_code=403,
            detail="Missing required permission: create:orders")
    return token_payload
```

---

### ✅ 9. After an order is placed, save it to the user's Auth0 profile

The backend uses its M2M credentials (Auth0 Management API) to read and update
the user's `app_metadata.orders` array. Customer order history is now part of
the customer's identity profile — accessible to any microservice that validates
the token, and visible in the Auth0 user dashboard for support agents.

**Backend** (`backend/main.py:186-198, 240-260`):
```python
async def patch_user_app_metadata(user_id: str, app_metadata: dict) -> dict:
    mgmt_token = await get_mgmt_token()
    await client.patch(
        f"https://{AUTH0_DOMAIN}/api/v2/users/{user_id}",
        headers={"Authorization": f"Bearer {mgmt_token}"},
        json={"app_metadata": app_metadata},
    )

# Inside place_order:
existing_orders = (user_profile.get("app_metadata") or {}).get("orders", [])
updated_orders = (existing_orders + [new_order])[-20:]   # keep last 20
new_app_metadata = {**(user_profile.get("app_metadata") or {}), "orders": updated_orders}
await patch_user_app_metadata(user_id, new_app_metadata)
```

M2M credentials are injected via **Kubernetes Secret** at pod start — never
committed to source. See `k8s/secret.example.yaml` for the shape.

---

### ✅ 10. Add the user's order history to their ID token on login

A **Post-Login Action** in Auth0 reads `event.user.app_metadata.orders` and
injects it into the ID token as a custom claim. The React app then reads the
claim directly from the SDK — **zero API calls** to render the order history,
the dashboard, the reorder CTA, or the loyalty tier.

**Action source** — `auth0/actions/inject-order-history.js`:
```javascript
exports.onExecutePostLogin = async (event, api) => {
  const orders = event.user.app_metadata?.orders || [];
  api.idToken.setCustomClaim('https://pizza42.com/orders', orders);
  api.idToken.setCustomClaim('https://pizza42.com/email_verified', event.user.email_verified);
};
```

**Frontend reads the claim directly** (`src/App.jsx:11, 39`):
```jsx
const PIZZA42_ORDERS_CLAIM = 'https://pizza42.com/orders'
const orderHistoryFromToken = user?.[PIZZA42_ORDERS_CLAIM] || []
```

**Custom claims are namespaced** with a URL (per OIDC spec) to avoid colliding
with standard JWT claims.

---

## Implementation summary by layer

| Layer | What's in there |
|---|---|
| **Auth0 tenant** | 1 SPA app · 1 custom API · 2 M2M apps · Database Connection · Google Social · 2 Post-Login Actions · RBAC enabled · Refresh token rotation |
| **Frontend** | React 19 + Auth0 React SDK · PKCE flow · refresh-token rotation · ID-token-driven UI (zero post-login API calls to render the dashboard) |
| **Backend** | FastAPI · JWT validation via JWKS · scope enforcement · live email-verification check · M2M-authenticated Management API calls |
| **Infrastructure** | Docker multi-stage · Kubernetes on EKS · Secrets via K8s Secrets · public AWS NLB |

---

## Discussion points (be ready for these)

- **Why store orders in `app_metadata` instead of our own DB?** For this POC it
  demonstrates the identity layer holding behavioral data. In production at
  Pizza 42's scale, we would keep authoritative orders in a real OLTP DB and
  only the **last N order summaries** in `app_metadata` — enough for marketing
  personalization and instant render at login time.

- **Why namespaced custom claims?** OIDC reserves un-namespaced claim names.
  Auth0 enforces the namespace requirement to prevent collisions.

- **Why check `email_verified` against the live profile, not just the token?**
  A stale token issued *before* the user verified could otherwise bypass the
  check. Fetching the live profile makes the gate authoritative.

- **Why a separate identity for the AI agent?** Least privilege. Even if the
  agent's code is compromised, it can only do what we explicitly granted —
  not escalate to user-level permissions.

- **How does Pizza 42 scale to a million users?** All authentication state is
  in JWTs, so the backend is stateless — horizontal scaling has no auth
  bottleneck. Auth0 itself handles the auth-server scale.
