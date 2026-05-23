import json
import os
import time
import uuid
from urllib.request import urlopen

import httpx
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from pydantic import BaseModel, Field

# Auth0 config
AUTH0_DOMAIN = os.getenv("AUTH0_DOMAIN", "dev-daz2luy7lq0sm8ba.us.auth0.com")
AUTH0_AUDIENCE = os.getenv("AUTH0_AUDIENCE", "https://auth0-learning-api")
AUTH0_ISSUER = f"https://{AUTH0_DOMAIN}/"
ALGORITHMS = ["RS256"]

# Management API config
AUTH0_M2M_CLIENT_ID = os.getenv("AUTH0_M2M_CLIENT_ID", "")
AUTH0_M2M_CLIENT_SECRET = os.getenv("AUTH0_M2M_CLIENT_SECRET", "")
AUTH0_MGMT_AUDIENCE = f"https://{AUTH0_DOMAIN}/api/v2/"

# AI Agent config
AUTH0_AGENT_CLIENT_ID = os.getenv("AUTH0_AGENT_CLIENT_ID", "")
AUTH0_AGENT_CLIENT_SECRET = os.getenv("AUTH0_AGENT_CLIENT_SECRET", "")

# In-memory caches
_mgmt_token_cache = {"token": None, "expires_at": 0}
_agent_token_cache = {"token": None, "expires_at": 0}

# Simple in-memory "consent store" — in production this would be a DB
# Maps user_id -> {granted: bool, granted_at: timestamp, scopes: [...]}
_agent_consents = {}

# Audit log for AI agent actions (also in-memory)
_agent_audit_log = []

app = FastAPI(title="Auth0 Learning API")
token_scheme = HTTPBearer()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_signing_keys():
    """Fetch Auth0's public keys (JWKS) to verify token signatures."""
    jwks_url = f"https://{AUTH0_DOMAIN}/.well-known/jwks.json"
    with urlopen(jwks_url) as response:
        return json.loads(response.read())


def verify_token(credentials: HTTPAuthorizationCredentials = Depends(token_scheme)) -> dict:
    """Validate the JWT access token from Auth0."""
    token = credentials.credentials
    try:
        jwks = get_signing_keys()
        unverified_header = jwt.get_unverified_header(token)
        rsa_key = {}
        for key in jwks["keys"]:
            if key["kid"] == unverified_header["kid"]:
                rsa_key = {
                    "kty": key["kty"], "kid": key["kid"], "use": key["use"],
                    "n": key["n"], "e": key["e"],
                }
                break
        if not rsa_key:
            raise HTTPException(status_code=401, detail="Unable to find signing key")
        payload = jwt.decode(
            token, rsa_key, algorithms=ALGORITHMS,
            audience=AUTH0_AUDIENCE, issuer=AUTH0_ISSUER,
        )
        return payload
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Token validation failed: {str(e)}")


def require_permission(required: str):
    def check(token_payload: dict = Depends(verify_token)):
        permissions = token_payload.get("permissions", [])
        if required not in permissions:
            raise HTTPException(
                status_code=403,
                detail=f"Missing required permission: {required}",
            )
        return token_payload
    return check


async def get_mgmt_token() -> str:
    """
    Get an Auth0 Management API token using M2M credentials.
    Cached for its lifetime (minus 60s buffer).
    """
    now = time.time()
    if _mgmt_token_cache["token"] and _mgmt_token_cache["expires_at"] > now + 60:
        return _mgmt_token_cache["token"]

    if not AUTH0_M2M_CLIENT_ID or not AUTH0_M2M_CLIENT_SECRET:
        raise HTTPException(
            status_code=500,
            detail="Management API credentials not configured (AUTH0_M2M_CLIENT_ID/SECRET env vars)"
        )

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"https://{AUTH0_DOMAIN}/oauth/token",
            json={
                "client_id": AUTH0_M2M_CLIENT_ID,
                "client_secret": AUTH0_M2M_CLIENT_SECRET,
                "audience": AUTH0_MGMT_AUDIENCE,
                "grant_type": "client_credentials",
            },
        )
        if resp.status_code != 200:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to get Management API token: {resp.text}"
            )
        data = resp.json()
        _mgmt_token_cache["token"] = data["access_token"]
        _mgmt_token_cache["expires_at"] = now + data["expires_in"]
        return data["access_token"]


# --- Public/Private endpoints (unchanged from before) ---

@app.get("/api/public")
def public_endpoint():
    return {"message": "This is a public endpoint - no auth required"}


@app.get("/api/private")
def private_endpoint(token_payload: dict = Depends(verify_token)):
    return {
        "message": "You have access to the private endpoint!",
        "user": token_payload.get("sub"),
        "permissions": token_payload.get("permissions", []),
        "token_claims": token_payload,
    }


@app.get("/api/read")
def read_endpoint(token_payload: dict = Depends(require_permission("read:data"))):
    return {"message": "You can read data!", "user": token_payload.get("sub")}


@app.get("/api/write")
def write_endpoint(token_payload: dict = Depends(require_permission("write:data"))):
    return {"message": "You can write data!", "user": token_payload.get("sub")}


@app.get("/api/admin")
def admin_endpoint(token_payload: dict = Depends(require_permission("delete:data"))):
    return {"message": "Welcome, admin!", "user": token_payload.get("sub")}


# ===================================================================
# PIZZA 42 — Order Management
# ===================================================================

class PlaceOrderRequest(BaseModel):
    pizza_name: str = Field(..., min_length=1, max_length=100)
    quantity: int = Field(default=1, ge=1, le=20)
    price: float = Field(default=0, ge=0, le=200)


async def get_user_full_profile(user_id: str) -> dict:
    """Fetch full user profile (including app_metadata) from Auth0 Management API."""
    mgmt_token = await get_mgmt_token()
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://{AUTH0_DOMAIN}/api/v2/users/{user_id}",
            headers={"Authorization": f"Bearer {mgmt_token}"},
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Failed to read user profile: {resp.text}")
        return resp.json()


async def patch_user_app_metadata(user_id: str, app_metadata: dict) -> dict:
    """Update a user's app_metadata via Management API."""
    mgmt_token = await get_mgmt_token()
    async with httpx.AsyncClient() as client:
        resp = await client.patch(
            f"https://{AUTH0_DOMAIN}/api/v2/users/{user_id}",
            headers={"Authorization": f"Bearer {mgmt_token}"},
            json={"app_metadata": app_metadata},
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Failed to update user: {resp.text}")
        return resp.json()


def require_create_orders(token_payload: dict = Depends(verify_token)) -> dict:
    """
    Pizza 42 requires the `create:orders` scope to place an order.
    Email verification is checked separately AGAINST the live profile,
    not the token, so verification status is authoritative.
    """
    permissions = token_payload.get("permissions", [])
    if "create:orders" not in permissions:
        raise HTTPException(
            status_code=403,
            detail="Missing required permission: create:orders",
        )
    return token_payload


@app.post("/api/orders")
async def place_order(
    order: PlaceOrderRequest,
    token_payload: dict = Depends(require_create_orders),
):
    """
    Place a pizza order.

    Requires:
      - Valid Auth0 access token
      - `create:orders` scope/permission in the token
      - Verified email (checked authoritatively via Management API)

    Saves the order to user.app_metadata.orders on Auth0.
    """
    user_id = token_payload["sub"]

    # Fetch the user's authoritative profile to check email_verified
    user_profile = await get_user_full_profile(user_id)
    if not user_profile.get("email_verified", False):
        raise HTTPException(
            status_code=403,
            detail="You must verify your email address before placing an order. "
                   "Check your inbox for the verification link, then log out and back in.",
        )

    # Build the new order
    new_order = {
        "id": str(uuid.uuid4()),
        "pizza_name": order.pizza_name,
        "quantity": order.quantity,
        "price": order.price,
        "placed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "received",
    }

    # Append to existing orders (last 20 only — keep app_metadata small)
    existing_orders = (user_profile.get("app_metadata") or {}).get("orders", [])
    updated_orders = (existing_orders + [new_order])[-20:]

    # Merge with other app_metadata fields if any
    new_app_metadata = {**(user_profile.get("app_metadata") or {}), "orders": updated_orders}

    # Persist to Auth0
    await patch_user_app_metadata(user_id, new_app_metadata)

    return new_order


@app.get("/api/orders")
async def get_orders(token_payload: dict = Depends(verify_token)):
    """Get order history from the user's Auth0 profile.

    Also returns the live `email_verified` flag so the frontend can
    self-heal stale tokens (e.g. a user who just clicked the email
    verification link still has email_verified=false in their token).
    """
    user_id = token_payload["sub"]
    user_profile = await get_user_full_profile(user_id)
    orders = (user_profile.get("app_metadata") or {}).get("orders", [])
    return {
        "orders": orders,
        "count": len(orders),
        "email_verified": user_profile.get("email_verified", False),
    }


@app.post("/api/profile/resend-verification")
async def resend_verification(token_payload: dict = Depends(verify_token)):
    """Trigger Auth0 to resend the email verification message."""
    user_id = token_payload["sub"]
    mgmt_token = await get_mgmt_token()
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"https://{AUTH0_DOMAIN}/api/v2/jobs/verification-email",
            headers={"Authorization": f"Bearer {mgmt_token}"},
            json={"user_id": user_id},
        )
        if resp.status_code not in (200, 201):
            raise HTTPException(status_code=502, detail=f"Resend failed: {resp.text}")
        return {"message": "Verification email sent! Check your inbox."}


# --- Management API endpoints (admin only) ---

@app.get("/api/mgmt/users")
async def list_users(token_payload: dict = Depends(require_permission("delete:data"))):
    """List all users in the Auth0 tenant. Requires admin permission."""
    mgmt_token = await get_mgmt_token()
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://{AUTH0_DOMAIN}/api/v2/users",
            headers={"Authorization": f"Bearer {mgmt_token}"},
            params={"per_page": 50, "include_totals": "true"},
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        return resp.json()


@app.get("/api/mgmt/users/{user_id}/roles")
async def get_user_roles(user_id: str, token_payload: dict = Depends(require_permission("delete:data"))):
    """Get roles assigned to a specific user."""
    mgmt_token = await get_mgmt_token()
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://{AUTH0_DOMAIN}/api/v2/users/{user_id}/roles",
            headers={"Authorization": f"Bearer {mgmt_token}"},
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        return resp.json()


@app.get("/api/mgmt/roles")
async def list_roles(token_payload: dict = Depends(require_permission("delete:data"))):
    """List all roles in the tenant."""
    mgmt_token = await get_mgmt_token()
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://{AUTH0_DOMAIN}/api/v2/roles",
            headers={"Authorization": f"Bearer {mgmt_token}"},
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        return resp.json()


@app.post("/api/mgmt/users/{user_id}/roles/{role_id}")
async def assign_role(user_id: str, role_id: str, token_payload: dict = Depends(require_permission("delete:data"))):
    """Assign a role to a user."""
    mgmt_token = await get_mgmt_token()
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"https://{AUTH0_DOMAIN}/api/v2/users/{user_id}/roles",
            headers={"Authorization": f"Bearer {mgmt_token}"},
            json={"roles": [role_id]},
        )
        if resp.status_code not in (200, 204):
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        return {"message": f"Role {role_id} assigned to {user_id}"}


@app.delete("/api/mgmt/users/{user_id}/roles/{role_id}")
async def remove_role(user_id: str, role_id: str, token_payload: dict = Depends(require_permission("delete:data"))):
    """Remove a role from a user."""
    mgmt_token = await get_mgmt_token()
    async with httpx.AsyncClient() as client:
        resp = await client.request(
            "DELETE",
            f"https://{AUTH0_DOMAIN}/api/v2/users/{user_id}/roles",
            headers={"Authorization": f"Bearer {mgmt_token}"},
            json={"roles": [role_id]},
        )
        if resp.status_code not in (200, 204):
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        return {"message": f"Role {role_id} removed from {user_id}"}


# --- AI Agent endpoints (Module 14) ---

async def get_agent_token(scopes: list[str]) -> dict:
    """
    Get a scoped access token for the AI agent.
    In real Auth0 AI, this would use CIBA or async authorization with user consent.
    Here we simulate it with M2M + consent check.

    Returns dict with token + decoded payload so we can show scopes in the UI.
    """
    now = time.time()
    if _agent_token_cache["token"] and _agent_token_cache["expires_at"] > now + 60:
        # return cached
        decoded = jwt.get_unverified_claims(_agent_token_cache["token"])
        return {"token": _agent_token_cache["token"], "decoded": decoded}

    if not AUTH0_AGENT_CLIENT_ID or not AUTH0_AGENT_CLIENT_SECRET:
        raise HTTPException(
            status_code=500,
            detail="Agent credentials not configured (AUTH0_AGENT_CLIENT_ID/SECRET env vars)"
        )

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"https://{AUTH0_DOMAIN}/oauth/token",
            json={
                "client_id": AUTH0_AGENT_CLIENT_ID,
                "client_secret": AUTH0_AGENT_CLIENT_SECRET,
                "audience": AUTH0_AUDIENCE,
                "grant_type": "client_credentials",
            },
        )
        if resp.status_code != 200:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to get agent token: {resp.text}"
            )
        data = resp.json()
        _agent_token_cache["token"] = data["access_token"]
        _agent_token_cache["expires_at"] = now + data["expires_in"]
        decoded = jwt.get_unverified_claims(data["access_token"])
        return {"token": data["access_token"], "decoded": decoded}


def audit_log(user_sub: str, action: str, status: str, details: str = ""):
    """Record an agent action."""
    entry = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "user": user_sub,
        "action": action,
        "status": status,
        "details": details,
    }
    _agent_audit_log.insert(0, entry)
    # keep last 20
    while len(_agent_audit_log) > 20:
        _agent_audit_log.pop()


@app.post("/api/agent/consent")
def grant_agent_consent(token_payload: dict = Depends(verify_token)):
    """
    Simulate the user granting the AI agent consent to act on their behalf.
    In real Auth0 AI, this would be the CIBA / async consent flow.
    """
    user_sub = token_payload["sub"]
    _agent_consents[user_sub] = {
        "granted": True,
        "granted_at": time.time(),
        "scopes": ["agent:read_stats", "agent:write_game"],
    }
    audit_log(user_sub, "grant_consent", "success", "User granted access to Homework Helper agent")
    return {"message": "Consent granted", "consent": _agent_consents[user_sub]}


@app.post("/api/agent/revoke")
def revoke_agent_consent(token_payload: dict = Depends(verify_token)):
    """Revoke the agent's access."""
    user_sub = token_payload["sub"]
    _agent_consents.pop(user_sub, None)
    audit_log(user_sub, "revoke_consent", "success", "User revoked agent access")
    return {"message": "Consent revoked"}


@app.get("/api/agent/consent")
def get_agent_consent(token_payload: dict = Depends(verify_token)):
    """Check if this user has granted consent."""
    user_sub = token_payload["sub"]
    return _agent_consents.get(user_sub, {"granted": False})


@app.get("/api/agent/audit")
def get_audit_log(token_payload: dict = Depends(verify_token)):
    """Show the audit trail of agent actions (filtered to this user)."""
    user_sub = token_payload["sub"]
    my_events = [e for e in _agent_audit_log if e["user"] == user_sub]
    return {"events": my_events}


@app.post("/api/agent/analyze")
async def agent_analyze(token_payload: dict = Depends(verify_token)):
    """
    The AI agent analyzes the user's game stats.
    Uses the AGENT's scoped token, NOT the user's token.
    Demonstrates that the agent operates with its own identity.
    """
    user_sub = token_payload["sub"]

    # Check consent
    if not _agent_consents.get(user_sub, {}).get("granted"):
        audit_log(user_sub, "analyze", "denied", "No consent granted")
        raise HTTPException(status_code=403, detail="Agent has no consent to act. Grant access first.")

    # Agent gets its OWN scoped token (not the user's)
    agent_token_data = await get_agent_token(["agent:read_stats"])
    agent_scopes = agent_token_data["decoded"].get("scope", "").split() or \
                   agent_token_data["decoded"].get("permissions", [])

    # Simulate the agent doing work (in real life: LLM call + tool use)
    # The agent can only call tools it's authorized for
    analysis = {
        "insight": "You win more with X than O. Start from center next game.",
        "total_games": 12,
        "win_rate": "66%",
        "recommendation": "Try corner openings to vary your strategy.",
    }

    audit_log(
        user_sub, "analyze", "success",
        f"Agent analyzed stats using scopes: {agent_scopes}"
    )

    return {
        "result": analysis,
        "agent_identity": agent_token_data["decoded"].get("azp", "unknown"),
        "agent_scopes": agent_scopes,
        "note": "This was computed by the AI agent using ITS OWN scoped token, not yours.",
    }


@app.post("/api/agent/suggest-move")
async def agent_suggest_move(token_payload: dict = Depends(verify_token)):
    """Agent suggests the next move. Uses agent:read_stats."""
    user_sub = token_payload["sub"]
    if not _agent_consents.get(user_sub, {}).get("granted"):
        audit_log(user_sub, "suggest_move", "denied", "No consent granted")
        raise HTTPException(status_code=403, detail="Agent has no consent. Grant access first.")

    agent_token_data = await get_agent_token(["agent:read_stats"])
    suggestion = {
        "move": "center",
        "reasoning": "Statistically the strongest opening. Controls the most winning lines.",
    }
    audit_log(user_sub, "suggest_move", "success", "Agent suggested center opening")
    return {"result": suggestion, "agent_scopes": agent_token_data["decoded"].get("permissions", [])}


@app.post("/api/agent/unauthorized-call")
async def agent_unauthorized(token_payload: dict = Depends(verify_token)):
    """
    Demonstrates scope enforcement: agent tries to call an admin endpoint
    using its scoped token. Backend checks the agent's scopes — it
    doesn't have delete:data, so this fails. This is the whole point
    of scoped agent tokens.
    """
    user_sub = token_payload["sub"]
    agent_token_data = await get_agent_token([])
    agent_perms = agent_token_data["decoded"].get("permissions", [])

    # Agent tries to do something admin-level
    if "delete:data" not in agent_perms:
        audit_log(
            user_sub, "unauthorized_call", "blocked",
            f"Agent tried admin action but only has: {agent_perms}"
        )
        raise HTTPException(
            status_code=403,
            detail=f"Agent BLOCKED. Its scopes are {agent_perms}, not [delete:data]. "
                   "This is the whole point of scoped agent tokens — even if compromised, "
                   "an agent can only do what it was authorized to do."
        )
    return {"message": "Unreachable"}
