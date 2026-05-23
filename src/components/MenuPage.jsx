import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'

const PIZZAS = [
  {
    id: 'margherita',
    name: 'Margherita',
    description: 'Fresh mozzarella, San Marzano tomatoes, basil',
    price: 12,
    emoji: '🍕',
  },
  {
    id: 'pepperoni',
    name: 'Pepperoni',
    description: 'Classic pepperoni, mozzarella, tomato sauce',
    price: 14,
    emoji: '🍕',
  },
  {
    id: 'hawaiian',
    name: 'Hawaiian',
    description: 'Ham, pineapple, mozzarella — yes, we make this',
    price: 13,
    emoji: '🍍',
  },
  {
    id: 'veggie',
    name: 'Veggie Supreme',
    description: 'Peppers, onions, mushrooms, olives, fresh tomatoes',
    price: 12,
    emoji: '🥦',
  },
  {
    id: 'meat-lovers',
    name: 'Meat Lovers',
    description: 'Pepperoni, sausage, bacon, ham — for the brave',
    price: 16,
    emoji: '🥓',
  },
  {
    id: 'bbq-chicken',
    name: 'BBQ Chicken',
    description: 'Grilled chicken, red onion, BBQ sauce, cilantro',
    price: 15,
    emoji: '🍗',
  },
]

const NS = 'https://auth0-learning-app/'

const TIER_TEASERS = {
  newbie:  { icon: '🍕', label: 'NEWBIE',  next: { label: 'REGULAR', at: 3, perk: '5% off' } },
  regular: { icon: '🥤', label: 'REGULAR', next: { label: 'VIP',     at: 6, perk: 'free delivery' } },
  vip:     { icon: '⭐', label: 'VIP',     next: { label: 'LEGEND',  at: 10, perk: 'free birthday pizza' } },
  legend:  { icon: '👑', label: 'LEGEND',  next: null },
}

export default function MenuPage({ orderHistoryFromToken }) {
  const { isAuthenticated, user, loginWithRedirect, getAccessTokenSilently } = useAuth0()
  const [ordering, setOrdering] = useState(null)
  const [toast, setToast] = useState(null)
  // Override the token claim with a server-confirmed verified state.
  // Lets users who just verified see the banner clear without log-out / log-in.
  const [serverVerifiedOverride, setServerVerifiedOverride] = useState(false)

  const isEmailVerified = user?.email_verified === true || serverVerifiedOverride
  const loginCount = user?.[`${NS}login_count`]
  const userTier = user?.[`${NS}user_tier`]
  const teaser = userTier ? TIER_TEASERS[userTier] : null

  // If the token says unverified, silently check the live profile in case
  // the user just clicked the verification link. As soon as the backend
  // reports verified=true, force a fresh token + drop the banner.
  useEffect(() => {
    if (!isAuthenticated || user?.email_verified === true) return
    let cancelled = false
    async function check() {
      try {
        const token = await getAccessTokenSilently()
        const res = await fetch('/api/orders', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && data.email_verified === true) {
          setServerVerifiedOverride(true)
          // Force fresh token in the background so future requests carry it.
          await getAccessTokenSilently({ cacheMode: 'off' })
        }
      } catch {
        /* ignore — banner stays until next login */
      }
    }
    check()
    const id = setInterval(check, 8000)
    return () => { cancelled = true; clearInterval(id) }
  }, [isAuthenticated, user?.email_verified, getAccessTokenSilently])

  async function placeOrder(pizza) {
    if (!isAuthenticated) {
      loginWithRedirect()
      return
    }
    // Soft frontend gate. The backend is the real gate (it fetches live
    // email_verified from Auth0). If the token says unverified but live
    // is verified, the backend will accept the order and we'll silently
    // refresh the token.
    if (!isEmailVerified) {
      setToast({
        type: 'warning',
        text: 'Verifying your email status…',
      })
    }

    setOrdering(pizza.id)
    setToast(null)

    const body = JSON.stringify({
      pizza_name: pizza.name,
      quantity: 1,
      price: pizza.price,
    })

    async function callOrders(forceFreshToken = false) {
      const token = await getAccessTokenSilently(
        forceFreshToken ? { cacheMode: 'off' } : undefined,
      )
      return fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body,
      })
    }

    try {
      let res = await callOrders()

      // Brand-new customers can hit a transient 403 if the "user" role was
      // assigned during this very login. Auth0 has updated their profile but
      // the current access token was issued before that. A single retry with
      // a forced-fresh token resolves it cleanly.
      if (res.status === 403) {
        res = await callOrders(true)
      }

      const data = await res.json()
      if (!res.ok) {
        setToast({ type: 'error', text: data.detail || 'Order failed' })
      } else {
        setToast({
          type: 'success',
          text: `🎉 Order placed! ${pizza.name} — ID: ${data.id?.substring(0, 8)}`,
        })
      }
    } catch (err) {
      setToast({ type: 'error', text: 'Network error: ' + err.message })
    }
    setOrdering(null)
  }

  return (
    <div className="menu-page">
      <div className="menu-hero">
        <h1>The Pizza 42 Menu 🍕</h1>
        <p>Hand-crafted pies, delivered fast.</p>
      </div>

      {isAuthenticated && !isEmailVerified && (
        <div className="verify-banner">
          ⚠️ <strong>Please verify your email</strong> to place orders. Check your inbox — we sent
          you a verification link at <code>{user.email}</code>.
          <Link to="/profile" className="verify-link">Go to Profile</Link>
        </div>
      )}

      {isAuthenticated && teaser && (
        <div className={`tier-teaser tier-teaser-${userTier}`}>
          <div className="tier-teaser-left">
            <span className="tier-teaser-icon">{teaser.icon}</span>
            <div>
              <div className="tier-teaser-label">You're a <strong>{teaser.label}</strong></div>
              {teaser.next ? (
                <div className="tier-teaser-progress">
                  Only <strong>{teaser.next.at - loginCount}</strong> more {teaser.next.at - loginCount === 1 ? 'login' : 'logins'} until <strong>{teaser.next.label}</strong> — unlock <strong>{teaser.next.perk}</strong>!
                </div>
              ) : (
                <div className="tier-teaser-progress">🏆 You're at the top tier. Enjoy your perks!</div>
              )}
            </div>
          </div>
          <Link to="/profile" className="tier-teaser-link">See all rewards →</Link>
        </div>
      )}

      {toast && <div className={`toast toast-${toast.type}`}>{toast.text}</div>}

      <div className="pizza-grid">
        {PIZZAS.map(pizza => (
          <div className="pizza-card" key={pizza.id}>
            <div className="pizza-emoji">{pizza.emoji}</div>
            <h3>{pizza.name}</h3>
            <p className="pizza-desc">{pizza.description}</p>
            <div className="pizza-footer">
              <span className="pizza-price">${pizza.price}</span>
              <button
                className="btn btn-order"
                onClick={() => placeOrder(pizza)}
                disabled={ordering !== null}
              >
                {ordering === pizza.id ? 'Placing...' : 'Order Now'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {orderHistoryFromToken && orderHistoryFromToken.length > 0 && (
        <div className="recent-orders-hint">
          You have <strong>{orderHistoryFromToken.length}</strong> previous order{orderHistoryFromToken.length === 1 ? '' : 's'}.{' '}
          <Link to="/orders">View order history →</Link>
        </div>
      )}
    </div>
  )
}
