import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'

function decodeJwt(token) {
  try {
    return JSON.parse(atob(token.split('.')[1]))
  } catch {
    return null
  }
}

function formatTimeLeft(seconds) {
  if (seconds <= 0) return 'EXPIRED'
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}m ${secs}s`
}

export default function TokenInspector() {
  const { isAuthenticated, getAccessTokenSilently, loginWithRedirect } = useAuth0()
  const [token, setToken] = useState(null)
  const [tokenInfo, setTokenInfo] = useState(null)
  const [now, setNow] = useState(Date.now())
  const [history, setHistory] = useState([])
  const [refreshing, setRefreshing] = useState(false)
  const [status, setStatus] = useState(null)
  const prevTokenRef = useRef(null)

  async function fetchToken(forceRefresh = false, label = null) {
    setRefreshing(true)
    setStatus(null)
    try {
      const t = await getAccessTokenSilently({
        cacheMode: forceRefresh ? 'off' : 'on',
      })
      const decoded = decodeJwt(t)
      const prevToken = prevTokenRef.current
      const changed = prevToken && prevToken !== t

      setToken(t)
      setTokenInfo(decoded)
      prevTokenRef.current = t

      // Determine event type
      let reason
      if (!prevToken) reason = 'Initial load'
      else if (changed) reason = label || (forceRefresh ? 'Manual refresh' : 'Auto refresh')
      else reason = label || 'Cache hit (no refresh)'

      setHistory(h => [
        {
          time: new Date().toLocaleTimeString(),
          tokenStart: t.substring(0, 20),
          reason,
          changed,
        },
        ...h.slice(0, 9),
      ])

      setStatus({
        type: changed ? 'success' : 'info',
        msg: changed
          ? 'New token received from Auth0!'
          : !prevToken
            ? 'Initial token loaded'
            : 'Cache hit — existing token is still valid (not expired)'
      })
    } catch (err) {
      setStatus({ type: 'error', msg: `Error: ${err.message}` })
    }
    setRefreshing(false)
  }

  // Initial load
  useEffect(() => {
    if (isAuthenticated) fetchToken(false, 'Initial load')
  }, [isAuthenticated])

  // Tick every second for the countdown
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  // Auto-refresh when token expires
  useEffect(() => {
    if (!tokenInfo) return
    const secondsLeft = tokenInfo.exp - Math.floor(now / 1000)
    if (secondsLeft <= 0 && !refreshing) {
      fetchToken(true, 'Auto refresh (expired)')
    }
  }, [now, tokenInfo, refreshing])

  if (!isAuthenticated) {
    return (
      <div className="page">
        <h1>Token Inspector</h1>
        <p>Log in to inspect tokens in real-time.</p>
        <button className="btn" style={{ marginTop: '16px' }} onClick={() => loginWithRedirect()}>
          Log In
        </button>
      </div>
    )
  }

  const secondsLeft = tokenInfo ? tokenInfo.exp - Math.floor(now / 1000) : 0
  const totalLifetime = tokenInfo ? tokenInfo.exp - tokenInfo.iat : 300
  const percentLeft = Math.max(0, Math.min(100, (secondsLeft / totalLifetime) * 100))
  const isExpiring = secondsLeft < 30 && secondsLeft > 0
  const isExpired = secondsLeft <= 0

  return (
    <div className="page">
      <h1>Token Inspector</h1>
      <p style={{ color: '#64748b' }}>Watch refresh tokens rotation in real-time</p>

      {tokenInfo && (
        <>
          <div className={`token-timer ${isExpired ? 'expired' : isExpiring ? 'expiring' : ''}`}>
            <div className="timer-label">Access Token Expires In</div>
            <div className="timer-value">{formatTimeLeft(secondsLeft)}</div>
            <div className="timer-bar">
              <div className="timer-fill" style={{ width: `${percentLeft}%` }} />
            </div>
            <div className="timer-meta">
              <span>Issued: {new Date(tokenInfo.iat * 1000).toLocaleTimeString()}</span>
              <span>Expires: {new Date(tokenInfo.exp * 1000).toLocaleTimeString()}</span>
            </div>
          </div>

          <div className="token-actions">
            <button className="btn" onClick={() => fetchToken(true, 'Manual force refresh')} disabled={refreshing}>
              {refreshing ? 'Refreshing…' : 'Force Refresh Now'}
            </button>
            <button className="btn" onClick={() => fetchToken(false, 'Check cache')} disabled={refreshing}>
              Check Cache
            </button>
          </div>

          {status && (
            <div className={`status-msg ${status.type}`}>
              {status.msg}
            </div>
          )}

          <div className="token-details">
            <h3>Current Access Token</h3>
            <div className="token-preview">
              {token ? `${token.substring(0, 60)}...` : 'No token'}
            </div>

            <div className="claim-row">
              <span className="claim-key">Issuer (iss)</span>
              <span className="claim-value">{tokenInfo.iss}</span>
            </div>
            <div className="claim-row">
              <span className="claim-key">Audience (aud)</span>
              <span className="claim-value">{Array.isArray(tokenInfo.aud) ? tokenInfo.aud.join(', ') : tokenInfo.aud}</span>
            </div>
            <div className="claim-row">
              <span className="claim-key">Subject (sub)</span>
              <span className="claim-value">{tokenInfo.sub}</span>
            </div>
            <div className="claim-row">
              <span className="claim-key">Scopes</span>
              <span className="claim-value">{tokenInfo.scope || 'none'}</span>
            </div>
            <div className="claim-row">
              <span className="claim-key">Permissions</span>
              <span className="claim-value">{(tokenInfo.permissions || []).join(', ') || 'none'}</span>
            </div>
          </div>

          <div className="token-history">
            <h3>Token Refresh History</h3>
            {history.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '14px' }}>No events yet.</p>
            ) : (
              history.map((h, i) => (
                <div key={i} className={`history-row ${h.changed ? 'changed' : ''}`}>
                  <span className="history-time">{h.time}</span>
                  <span className="history-reason">{h.reason}</span>
                  <span className="history-token">{h.tokenStart}...</span>
                </div>
              ))
            )}
          </div>

          <div className="info-panel">
            <h3>How to watch it in DevTools</h3>
            <ol>
              <li>Open DevTools → <strong>Network</strong> tab</li>
              <li>Filter: type <code>token</code></li>
              <li>Click <strong>Force Refresh Now</strong> — you'll see <code>POST /oauth/token</code></li>
              <li>Click the request → <strong>Payload</strong>: grant_type=refresh_token</li>
              <li>Click <strong>Response</strong>: new access_token + NEW refresh_token (rotation!)</li>
            </ol>
            <p style={{ marginTop: '12px', fontSize: '13px', color: '#94a3b8' }}>
              <strong>Why sometimes nothing changes on Force Refresh?</strong> The Auth0 SDK may
              return the cached token if the browser already refreshed very recently. Try it again
              after a few seconds, or wait for auto-refresh on expiry.
            </p>
          </div>
        </>
      )}

      <div style={{ marginTop: '24px' }}>
        <Link to="/" className="btn">Back to Menu</Link>
      </div>
    </div>
  )
}
