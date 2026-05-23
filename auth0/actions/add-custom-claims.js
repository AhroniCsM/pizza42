/**
 * Auth0 Post-Login Action — Pizza 42
 *
 * Runs on every successful login. Does 3 things:
 *
 *   1. Computes the customer's loyalty tier from their login count
 *      and injects it into the ID + access tokens. Marketing uses
 *      this for tier-based offers, free delivery, etc.
 *
 *   2. Auto-assigns the "user" role (which carries the create:orders
 *      permission) to any customer who doesn't already have it. This
 *      is what lets every signed-up customer place orders — without
 *      requiring manual admin action for each new signup.
 *
 *   3. Auto-verifies emails coming from trusted social providers
 *      (Google, GitHub, Apple, Microsoft). These providers already
 *      verify their users' emails — forcing customers to re-verify
 *      would be friction with no security benefit.
 *
 * Tiers:
 *   - 1-2  logins → 🍕 NEWBIE   (welcome)
 *   - 3-5  logins → 🥤 REGULAR  (5% off)
 *   - 6-9  logins → ⭐ VIP      (free delivery)
 *   - 10+  logins → 👑 LEGEND   (birthday pizza + VIP perks)
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

// Social providers we trust to have already verified the user's email
const TRUSTED_SOCIAL_STRATEGIES = [
  'google-oauth2',
  'github',
  'apple',
  'microsoft',
  'windowslive',
  'facebook',
];

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

  // Access token — for any tier-based backend logic
  api.accessToken.setCustomClaim(`${namespace}login_count`, logins);
  api.accessToken.setCustomClaim(`${namespace}user_tier`, tier);

  // Management API client (used for role + email-verified updates)
  const mgmt = new ManagementClient({
    domain: event.secrets.MGMT_DOMAIN,
    clientId: event.secrets.MGMT_CLIENT_ID,
    clientSecret: event.secrets.MGMT_CLIENT_SECRET,
  });

  // Auto-verify email for trusted social providers.
  // Two-step: (1) override the claim in the CURRENT ID token so the frontend
  // doesn't need a second login to see the change, (2) persist to the user
  // profile via Management API so future logins are consistent.
  const isTrustedSocial = TRUSTED_SOCIAL_STRATEGIES.includes(event.connection.strategy);
  if (isTrustedSocial) {
    api.idToken.setCustomClaim('email_verified', true);
    if (!event.user.email_verified) {
      try {
        await mgmt.users.update(
          { id: event.user.user_id },
          { email_verified: true },
        );
      } catch (e) {
        console.log('Failed to persist email_verified:', e.message);
      }
    }
  }

  // Auto-assign user role so the customer can place orders
  const currentRoles = event.authorization?.roles || [];
  if (!currentRoles.includes('user')) {
    try {
      await mgmt.users.assignRoles(
        { id: event.user.user_id },
        { roles: [event.secrets.USER_ROLE_ID] },
      );
    } catch (e) {
      console.log('Failed to assign user role:', e.message);
    }
  }
};
