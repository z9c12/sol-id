'use client'

import { useState, useEffect } from 'react'
import { formatETA, shortAddr } from '@/lib/wallet-utils'

export function Tooltip({ text, dark }) {
  const [show, setShow] = useState(false)
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginLeft: 4 }}>
      <span
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 14, height: 14, borderRadius: '50%', fontSize: 9, fontWeight: 800,
          cursor: 'help', userSelect: 'none',
          background: dark ? '#2a2a3e' : '#e5e7eb',
          color: dark ? '#7F77DD' : '#6b7280',
          border: dark ? '1px solid #3c3c5a' : '1px solid #d1d5db'
        }}
      >?</span>
      {show && (
        <div style={{
          position: 'absolute', bottom: '120%', left: '50%', transform: 'translateX(-50%)',
          background: dark ? '#1a1a2e' : '#1f2937', color: '#e5e5e5',
          fontSize: 12, lineHeight: 1.5, padding: '8px 12px', borderRadius: 8,
          width: 220, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          border: '1px solid rgba(127,119,221,0.2)', zIndex: 9999,
          whiteSpace: 'normal', textAlign: 'left',
          animation: 'fadeSlideIn 0.15s ease'
        }}>
          {text}
          <div style={{
            position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
            width: 0, height: 0, borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            borderTop: `5px solid ${dark ? '#1a1a2e' : '#1f2937'}`
          }} />
        </div>
      )}
    </span>
  )
}

export function Spinner({ size = 18, color = '#7F77DD' }) {
  return (
    <span style={{
      display: 'inline-block', width: size, height: size,
      border: `2px solid ${color}33`, borderTop: `2px solid ${color}`,
      borderRadius: '50%', animation: 'spin 0.7s linear infinite', verticalAlign: 'middle'
    }} />
  )
}

export function ScoreRing({ score }) {
  const r = 54, c = 2 * Math.PI * r
  const filled = (score / 100) * c
  const color = score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#ef4444'
  return (
    <div style={{ position: 'relative', width: 140, height: 140, margin: '0 auto' }}>
      <svg width="140" height="140" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="70" cy="70" r={r} fill="none" stroke="#1e1e2e" strokeWidth="10" />
        <circle cx="70" cy="70" r={r} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={`${filled} ${c}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 1s ease' }} />
      </svg>
      <div style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
      }}>
        <span style={{ fontSize: 36, fontWeight: 900, color, fontFamily: 'monospace', lineHeight: 1 }}>{score}</span>
        <span style={{ fontSize: 11, color: '#888', letterSpacing: 1 }}>/ 100</span>
      </div>
    </div>
  )
}

export function VerdictBanner({ sybil }) {
  return (
    <div style={{
      padding: '16px 20px', borderRadius: 14, marginBottom: 24,
      background: sybil.bg, border: `1.5px solid ${sybil.border}`,
      animation: 'fadeSlideIn 0.4s ease'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 22 }}>{sybil.emoji}</span>
        <div>
          <p style={{ fontWeight: 800, fontSize: 16, color: sybil.color, margin: 0 }}>{sybil.label}</p>
          <p style={{ fontSize: 13, color: sybil.color, opacity: 0.85, margin: 0 }}>{sybil.verdict}</p>
        </div>
      </div>
      <p style={{ fontSize: 13, color: '#aaa', margin: 0, paddingTop: 8, borderTop: `1px solid ${sybil.border}` }}>
        {sybil.recommendation}
      </p>
      {sybil.flags.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {sybil.flags.map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#ccc' }}>
              <span>{f.icon}</span><span>{f.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function WashBar({ score }) {
  const color = score > 60 ? '#ef4444' : score > 30 ? '#f59e0b' : '#22c55e'
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ height: 8, background: '#1e1e2e', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: score + '%', borderRadius: 99,
          background: `linear-gradient(90deg, #22c55e, #f59e0b, #ef4444)`,
          backgroundSize: '200% 100%', backgroundPosition: `${score}% 0`
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12, color: '#888' }}>
        <span>low risk</span>
        <span style={{ fontWeight: 800, color, fontSize: 14 }}>{score}/100</span>
        <span>high risk</span>
      </div>
    </div>
  )
}

export function ETABadge({ etaSeconds, startedAt }) {
  const [remaining, setRemaining] = useState(etaSeconds)
  useEffect(() => {
    if (!startedAt || !etaSeconds) return
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000)
      const rem = Math.max(0, etaSeconds - elapsed)
      setRemaining(rem)
      if (rem === 0) clearInterval(interval)
    }, 1000)
    return () => clearInterval(interval)
  }, [etaSeconds, startedAt])

  return (
    <span style={{
      fontSize: 11, padding: '2px 8px', borderRadius: 99,
      background: 'rgba(127,119,221,0.12)', color: '#7F77DD',
      border: '1px solid rgba(127,119,221,0.25)', fontFamily: 'monospace'
    }}>
      {remaining > 0 ? `ETA ${formatETA(remaining)}` : 'finishing...'}
    </span>
  )
}

export function ProgressCounter({ current, total, active, etaSeconds, startedAt }) {
  if (!active || total === 0) return null
  const pct = Math.round((current / total) * 100)
  return (
    <div style={{ padding: '14px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 13, color: '#888', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Spinner size={13} /> Analyzing transactions...
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {etaSeconds > 0 && <ETABadge etaSeconds={etaSeconds} startedAt={startedAt} />}
          <span style={{ fontSize: 13, fontFamily: 'monospace', color: '#7F77DD', fontWeight: 700 }}>
            {current}/{total}
          </span>
        </div>
      </div>
      <div style={{ height: 4, background: '#1e1e2e', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: pct + '%', borderRadius: 99,
          background: 'linear-gradient(90deg, #7F77DD, #22c55e)',
          transition: 'width 0.3s ease'
        }} />
      </div>
      <div style={{ textAlign: 'right', fontSize: 11, color: '#555', marginTop: 4 }}>{pct}%</div>
    </div>
  )
}

export function FundingTable({ fundingGraph }) {
  const openSolscan = (sig, isAddr) => {
    if (!sig) return
    const path = isAddr ? 'account' : 'tx'
    window.open(`https://solscan.io/${path}/${sig}`, '_blank')
  }

  if (!fundingGraph?.length) return null
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #1e1e2e' }}>
            <th style={{ textAlign: 'left', padding: '6px 8px', color: '#555', fontWeight: 600 }}>Source</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#555', fontWeight: 600 }}>SOL</th>
            <th style={{ textAlign: 'left', padding: '6px 8px', color: '#555', fontWeight: 600 }}>Transactions</th>
          </tr>
        </thead>
        <tbody>
          {fundingGraph.map((f, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #12121c' }}>
              <td style={{ padding: '8px 8px' }}>
                <span
                  onClick={() => openSolscan(f.fullAddr, true)}
                  style={{ fontFamily: 'monospace', color: '#7F77DD', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  {f.fullAddr ? shortAddr(f.fullAddr) : f.addr} ↗
                </span>
              </td>
              <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 700, color: '#fff', fontFamily: 'monospace' }}>
                {f.sol}
              </td>
              <td style={{ padding: '8px 8px' }}>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {(f.txSignatures || []).map((txSig, j) => (
                    <span
                      key={j}
                      onClick={() => openSolscan(txSig, false)}
                      style={{
                        cursor: 'pointer', fontSize: 10, padding: '2px 6px', borderRadius: 4,
                        background: 'rgba(127,119,221,0.1)', color: '#7F77DD',
                        border: '1px solid rgba(127,119,221,0.2)',
                        fontFamily: 'monospace', textDecoration: 'underline'
                      }}
                    >
                      {txSig.slice(0, 6)}...{txSig.slice(-4)} ↗
                    </span>
                  ))}
                  {(!f.txSignatures || f.txSignatures.length === 0) && (
                    <span style={{ color: '#444', fontSize: 11 }}>—</span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function PayETABadge({ startedAt }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!startedAt) return
    const iv = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)
    return () => clearInterval(iv)
  }, [startedAt])
  if (!startedAt) return null
  return (
    <span style={{
      fontSize: 11, padding: '2px 8px', borderRadius: 99,
      background: 'rgba(127,119,221,0.15)', color: '#7F77DD',
      border: '1px solid rgba(127,119,221,0.3)', fontFamily: 'monospace'
    }}>
      {elapsed < 10 ? 'Sending tx...' : elapsed < 30 ? 'Confirming...' : `${elapsed}s`}
    </span>
  )
}