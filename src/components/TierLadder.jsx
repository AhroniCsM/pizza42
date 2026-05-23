// TierLadder — visual progress component showing the customer their tier and
// how many more logins they need to reach the next one.
//
// 100% of the data comes from the JWT (login_count, user_tier custom claims) —
// no API calls, no DB lookups. Marketing changes thresholds in Auth0 Action.

const TIERS = [
  {
    id: 'newbie',
    label: 'NEWBIE',
    icon: '🍕',
    minLogins: 1,
    color: '#94a3b8',
    perk: 'Welcome to Pizza 42!',
    nextPerkHint: 'Order 3 times to unlock 5% off',
  },
  {
    id: 'regular',
    label: 'REGULAR',
    icon: '🥤',
    minLogins: 3,
    color: '#60a5fa',
    perk: '5% off every order',
    nextPerkHint: 'Order 6 times to unlock free delivery',
  },
  {
    id: 'vip',
    label: 'VIP',
    icon: '⭐',
    minLogins: 6,
    color: '#fbbf24',
    perk: 'Free delivery + 10% off',
    nextPerkHint: 'Order 10 times to unlock LEGEND status',
  },
  {
    id: 'legend',
    label: 'LEGEND',
    icon: '👑',
    minLogins: 10,
    color: '#f59e0b',
    perk: 'Free birthday pizza + 15% off + VIP perks',
    nextPerkHint: null,
  },
]

export default function TierLadder({ loginCount = 0, currentTier = 'newbie' }) {
  const currentIdx = TIERS.findIndex(t => t.id === currentTier)
  const safeIdx = currentIdx === -1 ? 0 : currentIdx
  const current = TIERS[safeIdx]
  const next = TIERS[safeIdx + 1]
  const loginsToNext = next ? next.minLogins - loginCount : 0

  return (
    <div className="tier-ladder">
      <div className="tier-ladder-header">
        <h3>Your Pizza 42 Status</h3>
        <p className="tier-subtitle">
          Every login takes you closer to bigger rewards. Powered by Auth0 Actions — your tier is computed at login and shipped in your JWT.
        </p>
      </div>

      {/* Current tier callout */}
      <div className="tier-current">
        <div className="tier-current-badge" style={{ '--tier-color': current.color }}>
          <span className="tier-icon-big">{current.icon}</span>
          <span className="tier-label-big">{current.label}</span>
        </div>
        <div className="tier-perk">
          <strong>Your perk:</strong> {current.perk}
        </div>
        {next && (
          <div className="tier-next-hint">
            ⏭️ {next.minLogins - loginCount} more {next.minLogins - loginCount === 1 ? 'login' : 'logins'} until <strong>{next.label}</strong> — {next.nextPerkHint}
          </div>
        )}
        {!next && (
          <div className="tier-next-hint">
            🏆 You're at the top tier. Enjoy your perks!
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="tier-progress-bar">
        {TIERS.map((tier, i) => {
          const reached = loginCount >= tier.minLogins
          const isCurrent = tier.id === currentTier
          return (
            <div
              key={tier.id}
              className={`tier-step ${reached ? 'reached' : ''} ${isCurrent ? 'current' : ''}`}
            >
              <div className="tier-step-icon" style={{ '--tier-color': tier.color }}>
                {tier.icon}
              </div>
              <div className="tier-step-label">{tier.label}</div>
              <div className="tier-step-logins">{tier.minLogins}+ logins</div>
              <div className="tier-step-perk">{tier.perk}</div>
            </div>
          )
        })}
      </div>

      <p className="tier-footnote">
        <strong>Login count:</strong> {loginCount}. This data lives in your ID token — no API call needed.
      </p>
    </div>
  )
}
