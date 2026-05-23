/**
 * Auth0 Post-Login Action — Add Custom Claims
 *
 * Computes the customer's Pizza 42 loyalty tier based on login count
 * and injects it (along with login count + login method) into both the
 * ID token and access token.
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

  // ID token — read by the React app
  api.idToken.setCustomClaim(`${namespace}login_count`, logins);
  api.idToken.setCustomClaim(`${namespace}user_tier`, tier);
  api.idToken.setCustomClaim(`${namespace}login_method`, event.connection.name);

  // Access token — available to the backend if it ever needs tier-based logic
  api.accessToken.setCustomClaim(`${namespace}login_count`, logins);
  api.accessToken.setCustomClaim(`${namespace}user_tier`, tier);
};
