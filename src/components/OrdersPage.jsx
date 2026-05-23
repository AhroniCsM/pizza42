import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'

const ORDERS_CLAIM = 'https://pizza42.com/orders'

export default function OrdersPage({ orderHistoryFromToken }) {
  const { isAuthenticated, loginWithRedirect, getAccessTokenSilently } = useAuth0()
  const [apiOrders, setApiOrders] = useState(null)
  const [loading, setLoading] = useState(false)

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

  return (
    <div className="page orders-page">
      <h1>📦 Your Orders</h1>
      <p className="orders-subtitle">
        Showing {displayOrders.length} order{displayOrders.length === 1 ? '' : 's'}.
        {!apiOrders && tokenOrders.length > 0 && (
          <span className="orders-source"> Loaded instantly from your ID token claims.</span>
        )}
      </p>

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
