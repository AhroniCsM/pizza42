/**
 * Auth0 Post-Login Action — Pizza 42 Custom Claims
 *
 * Runs on every successful login. Does 3 things:
 *
 *   1. Computes the customer's loyalty tier from their login count
 *      and injects it into the ID token (used by marketing for
 *      tier-based offers and personalization in the UI).
 *
 *   2. Adds login_count and login_method as ID-token claims so the
 *      frontend can render "Login #N" and "via google-oauth2"
 *      without an extra API call.
 *
 *   3. Ensures every authenticated customer has the `create:orders`
 *      permission. Placing a pizza order is the core capability of
 *      the app — it should be available to anyone who signed up,
 *      not gated by an admin role. (Admin users still get their
 *      additional read/write/delete:data permissions via RBAC.)
 *
 * Tiers:
 *   - 1-2  logins → 🍕 NEWBIE   (welcome)
 *   - 3-5  logins → 🥤 REGULAR  (5% off)
 *   - 6-9  logins → ⭐ VIP      (free delivery)
 *   - 10+  logins → 👑 LEGEND   (birthday pizza + VIP perks)
 *
 * Marketing can change thresholds without an app deploy.
 *
 * Trigger: Post-Login
 * Runtime: Node 22
 */
exports.onExecutePostLogin = async (event, api) => {
  const namespace = 'https://auth0-learning-app/';
  const logins = event.stats.logins_count;

  let tier;
  if (logins >= 10)     tier = 'legend';
  else if (logins >= 6) tier = 'vip';
  else if (logins >= 3) tier = 'regular';
  else                  tier = 'newbie';

  // ID token — consumed by the React app
  api.idToken.setCustomClaim(`${namespace}login_count`, logins);
  api.idToken.setCustomClaim(`${namespace}user_tier`, tier);
  api.idToken.setCustomClaim(`${namespace}login_method`, event.connection.name);

  // Access token — available to the backend if it ever needs tier-based logic
  api.accessToken.setCustomClaim(`${namespace}login_count`, logins);
  api.accessToken.setCustomClaim(`${namespace}user_tier`, tier);

  // Every authenticated Pizza 42 customer can place orders.
  // Admin users keep their additional permissions (read/write/delete:data)
  // via the standard RBAC flow.
  const currentPermissions = event.authorization?.permissions || [];
  if (!currentPermissions.includes('create:orders')) {
    api.accessToken.setCustomClaim('permissions', [...currentPermissions, 'create:orders']);
  }
};
