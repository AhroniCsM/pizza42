import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'

const ENDPOINT_REQUIRES = {
  '/api/public': null,
  '/api/private': '(any authenticated user)',
  '/api/read': 'read:data',
  '/api/write': 'write:data',
  '/api/admin': 'delete:data',
}

export default function Auth0Page({ customClaims }) {
  const { isAuthenticated, user, loginWithRedirect, getAccessTokenSilently } = useAuth0()
  const [apiResult, setApiResult] = useState(null)

  async function callApi(endpoint) {
    setApiResult(null)
    try {
      const options = {}
      let myPermissions = []
      if (endpoint !== '/api/public') {
        const token = await getAccessTokenSilently()
        options.headers = { Authorization: `Bearer ${token}` }
        try {
          myPermissions = JSON.parse(atob(token.split('.')[1])).permissions || []
        } catch { /* ignore */ }
      }
      const res = await fetch(endpoint, options)
      const data = await res.json()
      setApiResult({ endpoint, status: res.status, data, myPermissions })
    } catch (err) {
      setApiResult({ endpoint, status: 'error', data: { error: err.message }, myPermissions: [] })
    }
  }

  return (
    <div className="page">
      <h1>Auth0 Demo</h1>

      {isAuthenticated ? (
        <div className="profile-section">
          <img src={user.picture} alt={user.name} className="profile-avatar" />
          <h2>{user.name}</h2>
          <p>{user.email}</p>

          {/* Connection type indicator (Module 8 — Database Connection demo) */}
          <div className="connection-indicator">
            {(() => {
              const sub = user.sub || ''
              if (sub.startsWith('google-oauth2|')) return <><span className="conn-icon">🔵</span><span>Google (Social Connection)</span></>
              if (sub.startsWith('github|')) return <><span className="conn-icon">⚫</span><span>GitHub (Social Connection)</span></>
              if (sub.startsWith('auth0|')) return <><span className="conn-icon">🟢</span><span>Email/Password (Database Connection)</span></>
              if (sub.startsWith('samlp|')) return <><span className="conn-icon">🏢</span><span>Enterprise SAML SSO</span></>
              if (sub.startsWith('oidc|')) return <><span className="conn-icon">🏢</span><span>Enterprise OIDC SSO</span></>
              return <><span className="conn-icon">❓</span><span>Unknown: {sub.split('|')[0]}</span></>
            })()}
          </div>

          {/* Custom claims from Auth0 Action */}
          {customClaims.loginCount !== undefined && (
            <div className="custom-claims">
              <h3>Custom Claims (from Auth0 Action)</h3>
              <div className="claims-grid">
                <div className="claim-item">
                  <span className="claim-label">Login Count</span>
                  <span className="claim-val">{customClaims.loginCount}</span>
                </div>
                <div className="claim-item">
                  <span className="claim-label">User Tier</span>
                  <span className={`claim-val tier-badge ${customClaims.userTier === 'premium' ? 'premium' : 'free'}`}>
                    {customClaims.userTier?.toUpperCase()}
                  </span>
                </div>
                <div className="claim-item">
                  <span className="claim-label">Login Method</span>
                  <span className="claim-val">{customClaims.loginMethod}</span>
                </div>
              </div>
              <p className="claim-note">These values are computed by an Auth0 Action at login time — not by app code.</p>
            </div>
          )}

          <div className="token-claims">
            <h3>ID Token Claims</h3>
            <pre>{JSON.stringify(user, null, 2)}</pre>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: '24px' }}>
          <p>Log in to see your profile and ID token claims.</p>
          <button className="btn" style={{ marginTop: '16px' }} onClick={() => loginWithRedirect()}>
            Log In
          </button>
        </div>
      )}

      <h2 style={{ marginTop: '40px' }}>API Endpoints</h2>
      <p style={{ color: '#64748b', marginBottom: '16px' }}>Test different permission levels</p>

      <div className="endpoint-grid">
        <div className="card">
          <h3>Public</h3>
          <p>No auth needed</p>
          <button className="btn" onClick={() => callApi('/api/public')}>/api/public</button>
        </div>
        <div className="card">
          <h3>Private</h3>
          <p>Any logged-in user</p>
          <button className="btn" onClick={() => callApi('/api/private')}>/api/private</button>
        </div>
        <div className="card">
          <h3>Read</h3>
          <p>Requires <code>read:data</code></p>
          <button className="btn" onClick={() => callApi('/api/read')}>/api/read</button>
        </div>
        <div className="card">
          <h3>Write</h3>
          <p>Requires <code>write:data</code></p>
          <button className="btn" onClick={() => callApi('/api/write')}>/api/write</button>
        </div>
        <div className="card">
          <h3>Admin</h3>
          <p>Requires <code>delete:data</code></p>
          <button className="btn btn-danger" onClick={() => callApi('/api/admin')}>/api/admin</button>
        </div>
      </div>

      {apiResult && (
        <div className={`api-result ${apiResult.status === 200 ? 'success' : 'error'}`}>
          <div className="result-header">
            <span>{apiResult.endpoint}</span>
            <span className="status-badge">{apiResult.status}</span>
          </div>
          <pre>{JSON.stringify(apiResult.data, null, 2)}</pre>

          {(apiResult.status === 403 || apiResult.status === 401) && (() => {
            const required = ENDPOINT_REQUIRES[apiResult.endpoint]
            const detailMatch = typeof apiResult.data?.detail === 'string' && apiResult.data.detail.match(/permission:\s*(\S+)/)
            const requiredFromBackend = detailMatch ? detailMatch[1] : required
            return (
              <div className="failure-breakdown">
                <h4>💡 Why this failed</h4>
                <div className="fb-row">
                  <span className="fb-label">Your token's permissions:</span>
                  <span className="fb-val">
                    {apiResult.myPermissions.length === 0
                      ? <em>(none — or not logged in)</em>
                      : apiResult.myPermissions.map(p => <span key={p} className="perm-pill">{p}</span>)}
                  </span>
                </div>
                <div className="fb-row">
                  <span className="fb-label">Endpoint required:</span>
                  <span className="fb-val"><span className="perm-pill required">{requiredFromBackend || '(unknown)'}</span></span>
                </div>
                <div className="fb-row">
                  <span className="fb-label">What would fix it:</span>
                  <span className="fb-val">
                    Assign a role containing <code>{requiredFromBackend}</code> to this user in Auth0 (Users → pick user → Roles → Assign Roles), then <strong>log out and log back in</strong> so a fresh JWT is issued.
                  </span>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      <div style={{ marginTop: '24px' }}>
        <Link to="/" className="btn">Back to Menu</Link>
      </div>
    </div>
  )
}
