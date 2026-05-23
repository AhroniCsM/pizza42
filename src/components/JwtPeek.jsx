import { useState, useEffect } from 'react'
import { useAuth0 } from '@auth0/auth0-react'

function decodeJwt(token) {
  try {
    const [headerB64, payloadB64] = token.split('.')
    return {
      header: JSON.parse(atob(headerB64)),
      payload: JSON.parse(atob(payloadB64)),
    }
  } catch {
    return null
  }
}

function formatTimeLeft(exp) {
  const secs = exp - Math.floor(Date.now() / 1000)
  if (secs <= 0) return 'EXPIRED'
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}m ${s}s`
}

export default function JwtPeek({ visible }) {
  const { getAccessTokenSilently, getIdTokenClaims } = useAuth0()
  const [open, setOpen] = useState(false)
  const [accessDecoded, setAccessDecoded] = useState(null)
  const [idClaims, setIdClaims] = useState(null)
  const [rawAccess, setRawAccess] = useState('')
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!open) return
    let cancelled = false
    Promise.all([getAccessTokenSilently(), getIdTokenClaims()])
      .then(([token, id]) => {
        if (cancelled) return
        setRawAccess(token)
        setAccessDecoded(decodeJwt(token))
        setIdClaims(id || null)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [open, getAccessTokenSilently, getIdTokenClaims])

  useEffect(() => {
    if (!open) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [open])

  if (!visible) return null

  return (
    <>
      <button
        className="jwt-peek-btn"
        title="Decode current JWT (admin only)"
        onClick={() => setOpen(true)}
      >
        🔑 Show JWT
      </button>

      {open && (
        <div className="jwt-peek-backdrop" onClick={() => setOpen(false)}>
          <div className="jwt-peek-modal" onClick={(e) => e.stopPropagation()}>
            <div className="jwt-peek-header">
              <h2>🔑 Current JWT</h2>
              <button className="jwt-peek-close" onClick={() => setOpen(false)}>✕</button>
            </div>

            <p className="jwt-peek-sub">
              This button is only visible because your access token contains <code>delete:data</code>.
              Non-admins can't see it.
            </p>

            {accessDecoded ? (
              <>
                <div className="jwt-peek-section">
                  <h3>Access Token — Header</h3>
                  <pre>{JSON.stringify(accessDecoded.header, null, 2)}</pre>
                </div>

                <div className="jwt-peek-section">
                  <h3>Access Token — Payload</h3>
                  <div className="jwt-claim-summary">
                    <div><strong>Subject:</strong> {accessDecoded.payload.sub}</div>
                    <div><strong>Audience:</strong> {Array.isArray(accessDecoded.payload.aud) ? accessDecoded.payload.aud.join(', ') : accessDecoded.payload.aud}</div>
                    <div><strong>Issuer:</strong> {accessDecoded.payload.iss}</div>
                    <div><strong>Expires in:</strong> {formatTimeLeft(accessDecoded.payload.exp)} <span className="jwt-now">(now: {new Date(now).toLocaleTimeString()})</span></div>
                    <div><strong>Permissions:</strong> {(accessDecoded.payload.permissions || []).map(p => <span key={p} className="perm-pill">{p}</span>)}</div>
                  </div>
                  <pre>{JSON.stringify(accessDecoded.payload, null, 2)}</pre>
                </div>

                <div className="jwt-peek-section">
                  <h3>Raw Access Token <span className="jwt-hint">(paste at jwt.io to inspect)</span></h3>
                  <textarea readOnly value={rawAccess} className="jwt-peek-raw" />
                </div>

                {idClaims && (
                  <div className="jwt-peek-section">
                    <h3>ID Token Claims</h3>
                    <pre>{JSON.stringify(idClaims, null, 2)}</pre>
                  </div>
                )}
              </>
            ) : (
              <p>Loading token…</p>
            )}
          </div>
        </div>
      )}
    </>
  )
}
