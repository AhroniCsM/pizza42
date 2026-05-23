import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'

export default function AdminPage() {
  const { isAuthenticated, getAccessTokenSilently } = useAuth0()
  const [permissions, setPermissions] = useState(null)
  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [userRoles, setUserRoles] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/')
      return
    }
    getAccessTokenSilently().then(token => {
      const payload = JSON.parse(atob(token.split('.')[1]))
      const perms = payload.permissions || []
      setPermissions(perms)
      if (!perms.includes('delete:data')) navigate('/')
    }).catch(() => navigate('/'))
  }, [isAuthenticated, getAccessTokenSilently, navigate])

  async function apiCall(path, options = {}) {
    const token = await getAccessTokenSilently()
    const res = await fetch(path, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
    })
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
    return res.json()
  }

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const [usersData, rolesData] = await Promise.all([
        apiCall('/api/mgmt/users'),
        apiCall('/api/mgmt/roles'),
      ])
      const userList = usersData.users || usersData
      setUsers(userList)
      setRoles(rolesData)

      // Fetch roles for each user
      const rolesByUser = {}
      await Promise.all(
        userList.map(async u => {
          try {
            rolesByUser[u.user_id] = await apiCall(`/api/mgmt/users/${encodeURIComponent(u.user_id)}/roles`)
          } catch {
            rolesByUser[u.user_id] = []
          }
        })
      )
      setUserRoles(rolesByUser)
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  async function toggleRole(userId, roleId, hasRole) {
    try {
      await apiCall(`/api/mgmt/users/${encodeURIComponent(userId)}/roles/${roleId}`, {
        method: hasRole ? 'DELETE' : 'POST',
      })
      const updated = await apiCall(`/api/mgmt/users/${encodeURIComponent(userId)}/roles`)
      setUserRoles(prev => ({ ...prev, [userId]: updated }))
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  if (permissions === null) return null

  return (
    <div className="page">
      <h1>Admin Panel</h1>
      <p style={{ color: '#64748b' }}>Manage users and roles via Auth0 Management API</p>

      <div style={{ marginTop: '20px' }}>
        <button className="btn" onClick={loadData} disabled={loading}>
          {loading ? 'Loading…' : 'Load Users & Roles'}
        </button>
      </div>

      {error && (
        <div className="status-msg error" style={{ marginTop: '16px' }}>
          {error}
        </div>
      )}

      {users.length > 0 && (
        <div className="users-table">
          <h3>Users in your Auth0 Tenant ({users.length})</h3>
          {users.map(user => {
            const assignedRoles = userRoles[user.user_id] || []
            const assignedRoleIds = assignedRoles.map(r => r.id)
            return (
              <div key={user.user_id} className="user-row">
                <div className="user-info">
                  {user.picture && <img src={user.picture} alt="" className="user-avatar" />}
                  <div className="user-meta">
                    <div className="user-name">{user.name || user.email || 'Unknown'}</div>
                    <div className="user-sub">{user.user_id}</div>
                    <div className="user-email">{user.email}</div>
                    <div className="user-stats">
                      Logins: {user.logins_count || 0} · Last: {user.last_login?.substring(0, 10) || 'never'}
                    </div>
                  </div>
                </div>
                <div className="user-roles">
                  {roles.map(role => {
                    const hasRole = assignedRoleIds.includes(role.id)
                    return (
                      <button
                        key={role.id}
                        className={`role-toggle ${hasRole ? 'assigned' : ''}`}
                        onClick={() => toggleRole(user.user_id, role.id, hasRole)}
                      >
                        {hasRole ? '✓ ' : '+ '}{role.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="info-panel" style={{ marginTop: '24px' }}>
        <h3>How this works</h3>
        <ol>
          <li>Frontend sends your user access token to <code>/api/mgmt/users</code></li>
          <li>Backend validates your token & checks you have <code>delete:data</code> permission</li>
          <li>Backend fetches its own M2M token from Auth0 (using client_id/secret)</li>
          <li>Backend calls Auth0 Management API with the M2M token</li>
          <li>Results returned to you</li>
        </ol>
        <p style={{ marginTop: '12px', fontSize: '13px', color: '#94a3b8' }}>
          The M2M credentials are stored as a Kubernetes Secret — never in code or git.
        </p>
      </div>

      <div style={{ marginTop: '24px' }}>
        <Link to="/" className="btn">Back to Menu</Link>
      </div>
    </div>
  )
}
