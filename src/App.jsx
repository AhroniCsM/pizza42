import { useState, useEffect } from 'react'
import { Routes, Route, Link } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import MenuPage from './components/MenuPage'
import OrdersPage from './components/OrdersPage'
import ProfilePage from './components/ProfilePage'
import AgentPage from './components/AgentPage'
import './App.css'

const NS = 'https://auth0-learning-app/'
const PIZZA42_ORDERS_CLAIM = 'https://pizza42.com/orders'

const TIER_BADGES = {
  newbie:   { label: 'NEWBIE',   icon: '🍕', color: 'newbie' },
  regular:  { label: 'REGULAR',  icon: '🥤', color: 'regular' },
  vip:      { label: 'VIP',      icon: '⭐', color: 'vip' },
  legend:   { label: 'LEGEND',   icon: '👑', color: 'legend' },
}

function App() {
  const { isAuthenticated, user, loginWithRedirect, logout } = useAuth0()
  const [customClaims, setCustomClaims] = useState({})

  useEffect(() => {
    if (!isAuthenticated || !user) {
      setCustomClaims({})
      return
    }
    setCustomClaims({
      loginCount: user[`${NS}login_count`],
      userTier: user[`${NS}user_tier`],
      loginMethod: user[`${NS}login_method`],
    })
  }, [isAuthenticated, user])

  // Order history comes from the ID token claim set by our Auth0 Action
  const orderHistoryFromToken = user?.[PIZZA42_ORDERS_CLAIM] || []
  const tierBadge = TIER_BADGES[customClaims.userTier] || null

  return (
    <div className="app">
      <nav className="navbar">
        <Link to="/" className="nav-brand">
          🍕 <span className="brand-name">Pizza 42</span>
        </Link>
        <div className="nav-links">
          <Link to="/">Menu</Link>
          {isAuthenticated && <Link to="/orders">Orders</Link>}
          {isAuthenticated && <Link to="/agent">🤖 Pizza Bot</Link>}
          {isAuthenticated && <Link to="/profile">Profile</Link>}
          {isAuthenticated ? (
            <>
              {tierBadge && (
                <span className={`tier-badge tier-${tierBadge.color}`}>
                  {tierBadge.icon} {tierBadge.label}
                </span>
              )}
              <img src={user.picture} alt="" className="nav-avatar" />
              <span className="nav-user">{user.name || user.nickname || user.email}</span>
              <button
                className="btn"
                onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
              >
                Log Out
              </button>
            </>
          ) : (
            <>
              <button
                className="btn btn-secondary"
                onClick={() => loginWithRedirect({ authorizationParams: { screen_hint: 'signup' } })}
              >
                Sign Up
              </button>
              <button className="btn" onClick={() => loginWithRedirect()}>
                Log In
              </button>
            </>
          )}
        </div>
      </nav>
      <Routes>
        <Route
          path="/"
          element={<MenuPage orderHistoryFromToken={orderHistoryFromToken} />}
        />
        <Route
          path="/orders"
          element={<OrdersPage orderHistoryFromToken={orderHistoryFromToken} />}
        />
        <Route
          path="/profile"
          element={<ProfilePage customClaims={customClaims} />}
        />
        <Route
          path="/agent"
          element={<AgentPage />}
        />
      </Routes>
    </div>
  )
}

export default App
