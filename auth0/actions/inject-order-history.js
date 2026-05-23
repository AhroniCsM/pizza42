/**
 * Auth0 Post-Login Action — Inject Order History
 *
 * Reads the user's order history from app_metadata.orders and adds it to
 * the ID token under a namespaced custom claim. The React app reads this
 * claim directly — no additional API call needed to render order history.
 *
 * This is the key performance win: customers see their orders the instant
 * the page renders, instead of after a network round-trip.
 *
 * Trigger: Post-Login
 * Runtime: Node 22
 */
exports.onExecutePostLogin = async (event, api) => {
  const orders = event.user.app_metadata?.orders || [];

  api.idToken.setCustomClaim('https://pizza42.com/orders', orders);
  api.idToken.setCustomClaim('https://pizza42.com/email_verified', event.user.email_verified);
};
