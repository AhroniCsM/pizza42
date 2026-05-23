/**
 * Auth0 Post-Login Action — Pizza 42 Custom Claims & Role Assignment
 *
 * Runs on every successful login. Does 3 things:
 *
 *   1. Computes the customer's loyalty tier from their login count
 *      and injects it into the ID + access tokens. Marketing uses
 *      this for tier-based offers, free delivery, etc.
 *
 *   2. Adds login_count and login_method as ID-token claims so the
 *      frontend can render "Login #N" and "via google-oauth2"
 *      without an extra API call.
 *
 *   3. Auto-assigns the "user" role (which carries the create:orders
 *      permission) to any customer who doesn't already have it. This
 *      is what lets every signed-up customer place orders — without
 *      requiring manual admin action for each new signup.
 *
 * Tiers:
 *   - 1-2  logins → 🍕 NEWBIE   (welcome)
 *   - 3-5  logins → 🥤 REGULAR  (5% off)
 *   - 6-9  logins → ⭐ VIP      (free delivery)
 *   - 10+  logins → 👑 LEGEND   (birthday pizza + VIP perks)
 *
 * Marketing can change thresholds without an app deploy.
 *
 * Required Action Secrets:
 *   - MGMT_DOMAIN          — Auth0 tenant domain
 *   - MGMT_CLIENT_ID       — M2M app authorized for Mgmt API
 *   - MGMT_CLIENT_SECRET   — (^)
 *   - USER_ROLE_ID         — id of the "user" role to assign
 *
 * Trigger: Post-Login
 * Runtime: Node 22
 */
const { ManagementClient } = require('auth0');

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

  // Access token — available to the backend if it needs tier-based logic
  api.accessToken.setCustomClaim(`${namespace}login_count`, logins);
  api.accessToken.setCustomClaim(`${namespace}user_tier`, tier);

  // Auto-assign the "user" role to brand-new customers so they can place orders.
  // The Management API call persists the role assignment; the frontend then
  // refreshes the access token to pick up the new permission.
  const currentRoles = event.authorization?.roles || [];
  if (!currentRoles.includes('user')) {
    try {
      const mgmt = new ManagementClient({
        domain: event.secrets.MGMT_DOMAIN,
        clientId: event.secrets.MGMT_CLIENT_ID,
        clientSecret: event.secrets.MGMT_CLIENT_SECRET,
      });
      await mgmt.users.assignRoles(
        { id: event.user.user_id },
        { roles: [event.secrets.USER_ROLE_ID] },
      );
    } catch (e) {
      console.log('Failed to assign user role:', e.message);
    }
  }
};
