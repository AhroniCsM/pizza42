import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'

export default function OrdersPage({ orderHistoryFromToken }) {
  const { isAuthenticated, loginWithRedirect, getAccessTokenSilently } = useAuth0()
  const [apiOrders, setApiOrders] = useState(null)
  const [loading, setLoading] = useState(false)
  const [reordering, setReordering] = useState(false)
  const [toast, setToast] = useState(null)

  async function refreshFromApi() {
    setLoading(true)
    try {
      const token = await getAccessTokenSilently()
      const res = await fetch('/api/orders', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      setApiOrders(data.orders || data || [])
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }

  // Auto-load fresh order data on page mount — no button click required.
  // The JWT already has the orders embedded (instant render),
  // but we silently fetch the latest from the API in the background.
  useEffect(() => {
    if (isAuthenticated) {
      refreshFromApi()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated])

  async function reorderPizza(pizza) {
    setReordering(true)
    setToast(null)
    try {
      const token = await getAccessTokenSilently()
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          pizza_name: pizza.pizza_name,
          quantity: pizza.quantity || 1,
          price: pizza.price,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setToast({ type: 'error', text: data.detail || 'Reorder failed' })
      } else {
        setToast({
          type: 'success',
          text: `🎉 Reordered ${pizza.pizza_name}! ID: ${data.id?.substring(0, 8)}`,
        })
        // refresh from API to show the new order
        await refreshFromApi()
      }
    } catch (err) {
      setToast({ type: 'error', text: 'Network error: ' + err.message })
    }
    setReordering(false)
  }

  if (!isAuthenticated) {
    return (
      <div className="page">
        <h1>Order History</h1>
        <p>Log in to see your previous orders.</p>
        <button className="btn" onClick={() => loginWithRedirect()}>Log In</button>
      </div>
    )
  }

  const tokenOrders = orderHistoryFromToken || []
  const displayOrders = apiOrders || tokenOrders

  // ===== Stats / Dashboard — computed 100% from JWT data =====
  const totalSpent = displayOrders.reduce(
    (sum, o) => sum + (o.price || 0) * (o.quantity || 1),
    0,
  )
  const totalOrders = displayOrders.length
  const avgOrderValue = totalOrders > 0 ? totalSpent / totalOrders : 0

  // Favorite pizza = most ordered
  const counts = displayOrders.reduce((acc, o) => {
    acc[o.pizza_name] = (acc[o.pizza_name] || 0) + (o.quantity || 1)
    return acc
  }, {})
  const favorite = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]

  // This month = orders placed in current month
  const now = new Date()
  const thisMonth = displayOrders.filter(o => {
    if (!o.placed_at) return false
    const d = new Date(o.placed_at)
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  }).length

  // Latest order for reorder CTA
  const latestOrder = displayOrders.length > 0
    ? [...displayOrders].sort((a, b) =>
        new Date(b.placed_at || 0) - new Date(a.placed_at || 0)
      )[0]
    : null

  return (
    <div className="page orders-page">
      <h1>📦 Your Orders</h1>
      <p className="orders-subtitle">
        {!apiOrders && tokenOrders.length > 0 && (
          <span className="orders-source">⚡ Loaded instantly from your ID token — zero API calls.</span>
        )}
      </p>

      {toast && <div className={`toast toast-${toast.type}`}>{toast.text}</div>}

      {/* ===== STATS DASHBOARD ===== */}
      {totalOrders > 0 && (
        <div className="stats-dashboard">
          <div className="stat-card">
            <div className="stat-icon">💰</div>
            <div className="stat-value">${totalSpent}</div>
            <div className="stat-label">Total Spent</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">🍕</div>
            <div className="stat-value">{totalOrders}</div>
            <div className="stat-label">Orders Placed</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">📈</div>
            <div className="stat-value">${avgOrderValue.toFixed(0)}</div>
            <div className="stat-label">Avg. Order</div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">📅</div>
            <div className="stat-value">{thisMonth}</div>
            <div className="stat-label">This Month</div>
          </div>
          {favorite && (
            <div className="stat-card stat-card-wide">
              <div className="stat-icon">⭐</div>
              <div className="stat-value-small">{favorite[0]}</div>
              <div className="stat-label">Your Favorite ({favorite[1]} ordered)</div>
            </div>
          )}
        </div>
      )}

      {/* ===== REORDER LATEST ===== */}
      {latestOrder && (
        <div className="reorder-card">
          <div className="reorder-left">
            <span className="reorder-emoji">🔁</span>
            <div>
              <div className="reorder-title">Get your favorite again</div>
              <div className="reorder-pizza">
                <strong>{latestOrder.pizza_name}</strong> · ${latestOrder.price}
                <span className="reorder-meta">
                  Last ordered {latestOrder.placed_at ? new Date(latestOrder.placed_at).toLocaleDateString() : ''}
                </span>
              </div>
            </div>
          </div>
          <button
            className="btn btn-reorder"
            onClick={() => reorderPizza(latestOrder)}
            disabled={reordering}
          >
            {reordering ? 'Placing...' : `🚀 Reorder Now`}
          </button>
        </div>
      )}

      <div className="orders-actions">
        <button className="btn btn-secondary" onClick={refreshFromApi} disabled={loading}>
          {loading ? 'Loading...' : '🔄 Refresh from API'}
        </button>
        <Link to="/" className="btn">+ New Order</Link>
      </div>

      {displayOrders.length === 0 ? (
        <div className="empty-state">
          <div style={{ fontSize: '4rem', marginBottom: '16px' }}>🍕</div>
          <h3>No orders yet</h3>
          <p>Hungry? <Link to="/">Browse our menu</Link> and place your first order!</p>
        </div>
      ) : (
        <div className="orders-list">
          <h3 className="orders-list-heading">Recent Orders</h3>
          {displayOrders.slice().reverse().map(order => (
            <div className="order-card" key={order.id}>
              <div className="order-card-main">
                <div className="order-pizza">
                  <span className="order-emoji">🍕</span>
                  <div>
                    <h3>{order.pizza_name}</h3>
                    <div className="order-meta">
                      Quantity: {order.quantity} · ${order.price * order.quantity}
                    </div>
                  </div>
                </div>
                <span className={`order-status status-${order.status || 'received'}`}>
                  {order.status || 'Received'}
                </span>
              </div>
              <div className="order-footer">
                <span className="order-id">ID: {order.id?.substring(0, 8) || 'n/a'}</span>
                <span className="order-date">
                  {order.placed_at ? new Date(order.placed_at).toLocaleString() : ''}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  )
}
