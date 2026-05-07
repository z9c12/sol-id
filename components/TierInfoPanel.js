'use client'

export default function TierInfoPanel({ type }) {
  const items = type === 'free'
    ? [
      { icon: '🔍', text: '10 most recent transactions scanned' },
      { icon: '🔄', text: 'Circular transfer detection' },
      { icon: '🎯', text: 'Round-amount flagging' },
      { icon: '📊', text: 'Basic sybil risk score' },
      { icon: '🕐', text: 'Wallet age estimate' },
    ]
    : [
      { icon: '🔬', text: 'Up to 1000 transactions scanned' },
      { icon: '📊', text: 'Top 10 funding source breakdown' },
      { icon: '🧹', text: 'Wash trading score (0–100)' },
      { icon: '🔗', text: 'Full funding graph with tx IDs' },
      { icon: '📄', text: 'PDF export of full report' },
      { icon: '⚡', text: 'Priority RPC (5× faster)' },
    ]

  return (
    <div style={{
      marginBottom: 12, padding: '12px 14px', borderRadius: 10,
      background: 'rgba(127,119,221,0.05)', border: '1px solid rgba(127,119,221,0.15)'
    }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: '#7F77DD', marginBottom: 8, letterSpacing: 1, textTransform: 'uppercase' }}>
        {type === 'free' ? 'Free includes' : 'Pro includes'}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#bbb' }}>
            <span>{item.icon}</span><span>{item.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}