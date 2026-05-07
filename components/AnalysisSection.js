'use client'

import { TOOLTIPS,shortAddr } from '@/lib/wallet-utils'
import { Tooltip, FundingTable, WashBar } from './ui'

export default function AnalysisSection({ analysis, pro, dark }) {
  if (!analysis) return null
  if (analysis.error) return (
    <div style={{ marginTop: 12, padding: 14, background: 'rgba(239,68,68,0.08)', borderRadius: 10, border: '1px solid rgba(239,68,68,0.2)', fontSize: 14, color: '#ef4444' }}>
      ⚠️ {analysis.error}
    </div>
  )

  const openSolscan = (fullAddr) => {
    if (!fullAddr) return
    const isTx = fullAddr.length > 60
    const path = isTx ? 'tx' : 'account'
    window.open(`https://solscan.io/${path}/${fullAddr}`, '_blank')
  }

  return (
    <div style={{ marginTop: 16, padding: 18, background: '#0f0f1a', borderRadius: 14, border: '1px solid #1e1e2e', animation: 'fadeSlideIn 0.3s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: '#fff', margin: 0 }}>
          {pro ? '🔬 Pro' : '🔍 Free'} analysis — {analysis.txAnalyzed} txs scanned
        </p>
        <span style={{
          fontSize: 11, padding: '3px 10px', borderRadius: 99,
          background: pro ? '#3C3489' : '#1e1e2e', color: pro ? '#fff' : '#888'
        }}>alchemy rpc</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        <div style={{
          padding: 14, borderRadius: 10, textAlign: 'center',
          background: analysis.hasCircularActivity ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.07)',
          border: `1px solid ${analysis.hasCircularActivity ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.15)'}`
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <p style={{ fontSize: 20, fontWeight: 800, color: analysis.hasCircularActivity ? '#ef4444' : '#22c55e', margin: 0 }}>
              {analysis.circular?.length || 0}
            </p>
            <Tooltip text={TOOLTIPS.circular} dark />
          </div>
          <p style={{ fontSize: 11, color: '#888', margin: 0 }}>Circular transfers</p>
        </div>
        <div style={{
          padding: 14, borderRadius: 10, textAlign: 'center',
          background: analysis.roundAmountCount > 2 ? 'rgba(245,158,11,0.1)' : 'rgba(34,197,94,0.07)',
          border: `1px solid ${analysis.roundAmountCount > 2 ? 'rgba(245,158,11,0.2)' : 'rgba(34,197,94,0.15)'}`
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <p style={{ fontSize: 20, fontWeight: 800, color: analysis.roundAmountCount > 2 ? '#f59e0b' : '#22c55e', margin: 0 }}>
              {analysis.roundAmountCount}
            </p>
            <Tooltip text={TOOLTIPS.roundAmounts} dark />
          </div>
          <p style={{ fontSize: 11, color: '#888', margin: 0 }}>Round-amount txs</p>
        </div>
      </div>

      {analysis.circular?.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#ef4444', marginBottom: 8 }}>🔄 Circular Transfer Counterparts</p>
          {analysis.circular.map((c, i) => (
            <div key={i} onClick={() => openSolscan(c.fullAddr)}
              style={{
                cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 14px', background: 'rgba(239,68,68,0.07)', borderRadius: 8, marginBottom: 6,
                border: '1px solid rgba(239,68,68,0.15)', transition: 'background 0.15s'
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.14)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.07)'}
            >
              <span style={{ fontFamily: 'monospace', fontSize: 13, color: '#ef4444', textDecoration: 'underline' }}>
                {c.fullAddr ? shortAddr(c.fullAddr) : c.addr} ↗
              </span>
              <span style={{ fontSize: 12, color: '#aaa' }}>{c.count} txs · ↑{c.sent} ↓{c.received} SOL</span>
            </div>
          ))}
        </div>
      )}

      {analysis.roundAmounts?.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b', marginBottom: 8 }}>🎯 Suspicious Round Amounts</p>
          {analysis.roundAmounts.slice(0, 6).map((r, i) => (
            <div key={i} onClick={() => openSolscan(r.txSignature)}
              style={{
                cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 14px', background: 'rgba(245,158,11,0.07)', borderRadius: 8, marginBottom: 6,
                border: '1px solid rgba(245,158,11,0.15)', transition: 'background 0.15s'
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(245,158,11,0.14)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(245,158,11,0.07)'}
            >
              <div>
                <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#f59e0b', textDecoration: 'underline' }}>View tx ↗</span>
                <span style={{ fontSize: 11, color: '#666', marginLeft: 8 }}>
                  {r.direction === 'sent' ? '↑ to' : '↓ from'} {r.addr}
                </span>
              </div>
              <span style={{ fontWeight: 700, color: '#fff', fontSize: 14 }}>{r.sol} SOL</span>
            </div>
          ))}
        </div>
      )}

      {pro && analysis.fundingGraph?.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#7F77DD', margin: 0 }}>📊 Top Funding Sources</p>
            <Tooltip text={TOOLTIPS.fundingSources} dark />
          </div>
          <FundingTable fundingGraph={analysis.fundingGraph} />
        </div>
      )}

      {pro && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#fff', margin: 0 }}>🧹 Wash Trading Score</p>
            <Tooltip text={TOOLTIPS.washScore} dark />
          </div>
          <WashBar score={analysis.washScore} />
        </div>
      )}
    </div>
  )
}