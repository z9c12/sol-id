'use client'

import { useState } from 'react'
import { getSybilRisk, shortAddr, walletAge, TOOLTIPS } from '@/lib/wallet-utils'
import { Tooltip, Spinner } from './ui'

export default function WalletCol({ dark, side, input, onInputChange, onFetch, loading, error, data }) {
  const bg = dark ? '#0f0f1a' : '#f8f8fc'
  const border = dark ? '#1e1e2e' : '#e2e2ef'
  const textColor = dark ? '#fff' : '#111'
  const subColor = dark ? '#888' : '#666'
  const inputBg = dark ? '#13131f' : '#fff'

  const sybil = data ? getSybilRisk({ balance: data.balance, txCount: data.txCount }) : null

  const handleKey = (e) => {
    if (e.key === 'Enter') onFetch()
  }

  return (
    <div style={{ flex: 1, padding: 16, borderRadius: 14, background: bg, border: `1px solid ${border}` }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: '#7F77DD', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
        {side === 'left' ? 'Wallet A' : 'Wallet B'}
      </p>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <input
          value={input}
          onChange={e => onInputChange(e.target.value)}
          onKeyDown={handleKey}
          placeholder="domain or address"
          style={{
            flex: 1, padding: '9px 12px', borderRadius: 8, border: `1px solid ${border}`,
            background: inputBg, color: textColor, fontSize: 13, outline: 'none'
          }}
        />
        <button
          onClick={onFetch}
          style={{ padding: '9px 14px', borderRadius: 8, background: '#7F77DD', color: '#fff', fontWeight: 700, fontSize: 13 }}
        >
          {loading ? <Spinner size={13} color="#fff" /> : 'Go'}
        </button>
      </div>
      {error && <p style={{ fontSize: 12, color: '#ef4444', marginBottom: 8 }}>⚠️ {error}</p>}
      {data && sybil && (
        <>
          <div style={{ marginBottom: 10, padding: '10px 12px', borderRadius: 10, background: sybil.bg, border: `1px solid ${sybil.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 16 }}>{sybil.emoji}</span>
              <div>
                <p style={{ fontSize: 13, fontWeight: 700, color: sybil.color, margin: 0 }}>{sybil.label}</p>
                <p style={{ fontSize: 11, color: sybil.color, opacity: 0.8, margin: 0 }}>{sybil.verdict}</p>
              </div>
            </div>
          </div>
          <div style={{ borderTop: `1px solid ${border}`, paddingTop: 10 }}>
            {[
              { label: 'Score', value: data.score, tip: TOOLTIPS.score },
              { label: 'SOL Balance', value: data.balance?.toFixed(3), tip: TOOLTIPS.balance },
              { label: 'Transactions', value: data.txCount, tip: TOOLTIPS.txCount },
              { label: 'Wallet Age', value: walletAge(data.walletAgeDays), tip: TOOLTIPS.walletAge },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center', padding: '10px 0' }}>
                <div style={{ fontSize: 11, color: subColor, marginBottom: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                  {s.label}<Tooltip text={s.tip} dark={dark} />
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: textColor, fontFamily: 'monospace' }}>{s.value}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}