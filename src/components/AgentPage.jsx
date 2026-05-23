import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'

const TOOLS = [
  { id: 'analyze', label: '🍕 Recommend a pizza for me', path: '/api/agent/analyze', scope: 'agent:read_stats' },
  { id: 'suggest', label: '⭐ What\'s my favorite?', path: '/api/agent/suggest-move', scope: 'agent:read_stats' },
  { id: 'admin', label: '🚨 Delete all customers (should fail)', path: '/api/agent/unauthorized-call', scope: 'delete:data', dangerous: true },
]

export default function AgentPage() {
  const { isAuthenticated, getAccessTokenSilently, loginWithRedirect, user } = useAuth0()
  const [consent, setConsent] = useState(null)
  const [messages, setMessages] = useState([
    {
      role: 'agent',
      text: "Hi! I'm Pizza Bot 🤖🍕. I can analyze your order history and recommend pizzas. Grant me access to get started.",
      time: new Date().toLocaleTimeString(),
    },
  ])
  const [audit, setAudit] = useState([])
  const [loading, setLoading] = useState(false)
  const [showAudit, setShowAudit] = useState(false)
  const chatRef = useRef(null)

  async function callApi(path, method = 'GET') {
    const token = await getAccessTokenSilently()
    const res = await fetch(path, {
      method,
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json().catch(() => ({}))
    return { status: res.status, data }
  }

  async function loadConsent() {
    const r = await callApi('/api/agent/consent')
    setConsent(r.data)
  }

  async function loadAudit() {
    const r = await callApi('/api/agent/audit')
    setAudit(r.data.events || [])
  }

  useEffect(() => {
    if (isAuthenticated) {
      loadConsent()
      loadAudit()
    }
  }, [isAuthenticated])

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  function pushMsg(msg) {
    setMessages(prev => [...prev, { ...msg, time: new Date().toLocaleTimeString() }])
  }

  async function grantConsent() {
    setLoading(true)
    await callApi('/api/agent/consent', 'POST')
    await loadConsent()
    await loadAudit()
    pushMsg({ role: 'system', text: '✅ Access granted. The agent can now call tools on your behalf.' })
    pushMsg({ role: 'agent', text: "Thanks! I can now help you. Pick a tool below to start 👇" })
    setLoading(false)
  }

  async function revokeConsent() {
    setLoading(true)
    await callApi('/api/agent/revoke', 'POST')
    await loadConsent()
    await loadAudit()
    pushMsg({ role: 'system', text: '🔒 Access revoked. The agent can no longer act.' })
    setLoading(false)
  }

  async function runTool(tool) {
    if (loading) return
    setLoading(true)

    // User message
    pushMsg({ role: 'user', text: tool.label })

    // Agent "thinking"
    pushMsg({ role: 'agent', text: '⏳ Calling tool...', thinking: true, toolId: tool.id })

    const r = await callApi(tool.path, 'POST')

    // Remove the thinking message, add real response
    setMessages(prev => {
      const filtered = prev.filter(m => !m.thinking)
      let responseText = ''
      let showDetails = null
      if (r.status === 200) {
        const result = r.data.result || {}
        if (tool.id === 'analyze') {
          responseText = `🍕 Based on your order history, I recommend the **Pepperoni Classic** — you've ordered savory pies 3 times this month. Want me to add it to your cart?`
        } else if (tool.id === 'suggest') {
          responseText = `⭐ Your favorite is the **Margherita** — you've ordered it 4 times. Quick reorder?`
        } else {
          responseText = `Result: ${JSON.stringify(result)}`
        }
        showDetails = {
          scopes: r.data.agent_scopes || [],
          agentId: r.data.agent_identity,
        }
      } else if (r.status === 403) {
        responseText = `❌ Blocked! ${r.data.detail || 'Not authorized'}\n\nThis is scoped auth in action — even if I wanted to delete data, Auth0 wouldn't let me.`
      } else {
        responseText = `Error ${r.status}: ${r.data.detail || 'unknown'}`
      }
      return [...filtered, {
        role: 'agent',
        text: responseText,
        time: new Date().toLocaleTimeString(),
        status: r.status,
        details: showDetails,
      }]
    })

    await loadAudit()
    setLoading(false)
  }

  if (!isAuthenticated) {
    return (
      <div className="page">
        <h1>Pizza Bot</h1>
        <p>Log in to try the AI agent demo.</p>
        <button className="btn" style={{ marginTop: '16px' }} onClick={() => loginWithRedirect()}>
          Log In
        </button>
      </div>
    )
  }

  const isGranted = consent?.granted

  return (
    <div className="page agent-page">
      <h1>🤖 Pizza Bot</h1>
      <p style={{ color: '#64748b', marginBottom: '20px' }}>
        A chat agent using the Auth0 AI Agents pattern — scoped, audited, revokable.
      </p>

      {/* Consent banner */}
      {!isGranted && (
        <div className="consent-banner">
          <div>
            <strong>🔒 Access required.</strong>
            <span> Pizza Bot needs permission to read your order history before it can make recommendations.</span>
          </div>
          <button className="btn" onClick={grantConsent} disabled={loading}>
            Grant Access
          </button>
        </div>
      )}

      {/* Chat */}
      <div className="chat-container">
        <div className="chat-header">
          <div className="chat-info">
            <span className="chat-dot" />
            <span>Pizza Bot</span>
            {isGranted && (
              <span className="chat-scopes">
                {(consent.scopes || []).map(s => <code key={s}>{s}</code>)}
              </span>
            )}
          </div>
          {isGranted && (
            <button className="chat-revoke" onClick={revokeConsent}>
              Revoke
            </button>
          )}
        </div>

        <div className="chat-messages" ref={chatRef}>
          {messages.map((m, i) => (
            <div key={i} className={`chat-msg chat-msg-${m.role}`}>
              {m.role === 'agent' && <div className="chat-avatar">🤖</div>}
              {m.role === 'user' && user?.picture && <img src={user.picture} alt="" className="chat-avatar chat-avatar-user" />}
              <div className="chat-bubble">
                <div className="chat-text">{m.text}</div>
                {m.details && (
                  <div className="chat-meta">
                    <span className="chat-meta-label">Called by:</span>
                    <code>{m.details.agentId?.substring(0, 12) || 'agent'}</code>
                    <span className="chat-meta-label">with scopes:</span>
                    {(m.details.scopes || []).map(s => <code key={s}>{s}</code>)}
                  </div>
                )}
                <div className="chat-time">{m.time}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Tool buttons */}
        <div className="chat-tools">
          {TOOLS.map(t => (
            <button
              key={t.id}
              className={`chat-tool ${t.dangerous ? 'dangerous' : ''}`}
              disabled={loading || !isGranted}
              onClick={() => runTool(t)}
            >
              <span className="tool-label">{t.label}</span>
              <span className="tool-scope">{t.scope}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Audit toggle */}
      <button className="audit-toggle" onClick={() => setShowAudit(!showAudit)}>
        {showAudit ? '▾' : '▸'} Audit Trail ({audit.length} events)
      </button>

      {showAudit && (
        <div className="audit-section">
          <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '12px' }}>
            Every agent action is logged. In real Auth0 AI, this also appears in the Auth0 Dashboard → Logs.
          </p>
          {audit.length === 0 ? (
            <p style={{ color: '#64748b', fontSize: '14px' }}>No events yet.</p>
          ) : (
            audit.map((e, i) => (
              <div key={i} className="audit-row">
                <span className="audit-time">{e.timestamp.split(' ')[1]}</span>
                <span className="audit-action">{e.action}</span>
                <span className={`audit-status ${e.status}`}>{e.status}</span>
                <span className="audit-details">{e.details}</span>
              </div>
            ))
          )}
        </div>
      )}

      <div style={{ marginTop: '24px' }}>
        <Link to="/" className="btn">Back to Menu</Link>
      </div>
    </div>
  )
}
