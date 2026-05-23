import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import TierLadder from './TierLadder'

export default function ProfilePage({ customClaims }) {
  const { isAuthenticated, user, loginWithRedirect } = useAuth0()
  const [resendStatus, setResendStatus] = useState(null)

  if (!isAuthenticated) {
    return (
      <div className="page">
        <h1>Your Profile</h1>
        <p>Log in to see your profile.</p>
        <button className="btn" style={{ marginTop: '16px' }} onClick={() => loginWithRedirect()}>
          Log In
        </button>
      </div>
    )
  }

  // Detect connection type from sub prefix
  function getConnectionType(sub) {
    if (!sub) return { icon: '❓', label: 'Unknown' }
    if (sub.startsWith('google-oauth2|')) return { icon: '🔵', label: 'Google (Social)' }
    if (sub.startsWith('github|')) return { icon: '⚫', label: 'GitHub (Social)' }
    if (sub.startsWith('auth0|')) return { icon: '✉️', label: 'Email / Password' }
    if (sub.startsWith('samlp|')) return { icon: '🏢', label: 'Enterprise SAML' }
    return { icon: '❓', label: sub.split('|')[0] }
  }

  const conn = getConnectionType(user.sub)
  const isVerified = user.email_verified === true

  return (
    <div className="page profile-page">
      <h1>Your Profile</h1>

      <div className="profile-card">
        <img src={user.picture} alt={user.name} className="profile-avatar" />
        <h2>{user.name || user.nickname || user.email}</h2>
        <p className="profile-email">{user.email}</p>

        <div className="profile-badges">
          <span className="badge badge-connection">
            <span className="badge-icon">{conn.icon}</span> {conn.label}
          </span>
          <span className={`badge ${isVerified ? 'badge-verified' : 'badge-unverified'}`}>
            {isVerified ? '✅ Email Verified' : '⚠️ Email Not Verified'}
          </span>
        </div>

        {!isVerified && (
          <div className="verify-callout">
            <p>
              <strong>Verify your email to start ordering.</strong>
            </p>
            <p>
              We sent a verification email to <code>{user.email}</code>. Click the link in that
              email, then log out and back in.
            </p>
            {resendStatus && <p className="resend-status">{resendStatus}</p>}
          </div>
        )}
      </div>

      {/* Tier ladder — visual loyalty program, data 100% from JWT */}
      {customClaims && customClaims.loginCount !== undefined && (
        <TierLadder
          loginCount={customClaims.loginCount}
          currentTier={customClaims.userTier}
        />
      )}

      <div className="token-claims">
        <h3>ID Token Claims (raw)</h3>
        <p className="claims-subtitle">
          This is everything Auth0 told my app about you in a single JWT. Notice the{' '}
          <code>email_verified</code>, the social provider details, and the custom claims —
          no extra API calls needed to populate this page.
        </p>
        <pre>{JSON.stringify(user, null, 2)}</pre>
      </div>

      <div style={{ marginTop: '24px' }}>
        <Link to="/" className="btn">Back to Menu</Link>
      </div>
    </div>
  )
}
