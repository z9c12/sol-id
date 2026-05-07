'use client'

import { useState } from 'react'
import { isValidSolanaAddress, calcScore } from '@/lib/wallet-utils'
import WalletCol from './WalletCol'

export default function ComparePanel({ dark }) {
  const [leftInput, setLeftInput] = useState('')
  const [rightInput, setRightInput] = useState('')
  const [leftData, setLeftData] = useState(null)
  const [rightData, setRightData] = useState(null)
  const [leftLoading, setLeftLoading] = useState(false)
  const [rightLoading, setRightLoading] = useState(false)
  const [leftError, setLeftError] = useState(null)
  const [rightError, setRightError] = useState(null)

  const border = dark ? '#1e1e2e' : '#ddddf0'
  const textColor = dark ? '#fff' : '#111'
  const subColor = dark ? '#333' : '#ccc'

  async function fetchWallet(input, setData, setLoading, setError) {
    if (!input.trim()) return
    setLoading(true); setError(null); setData(null)
    try {
      if (isValidSolanaAddress(input.trim())) {
        const { Connection, LAMPORTS_PER_SOL, PublicKey } = await import('@solana/web3.js')
        const connection = new Connection(process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL || 'https://api.mainnet-beta.solana.com')
        const pubkey = new PublicKey(input.trim())
        const balanceLamports = await connection.getBalance(pubkey)
        const balance = balanceLamports / LAMPORTS_PER_SOL
        const sigs = await connection.getSignaturesForAddress(pubkey, { limit: 100 })
        const txCount = sigs.length
        const oldestSig = sigs[sigs.length - 1]
        const walletAgeDays = oldestSig?.blockTime
          ? Math.floor((Date.now() / 1000 - oldestSig.blockTime) / 86400) : 0
        const score = calcScore({ balance, txCount, walletAgeDays })
        setData({ wallet: input.trim(), domain: input.trim().slice(0,4)+'...'+input.trim().slice(-4), balance, txCount, walletAgeDays, score })
      } else {
        const res = await fetch(`/api/lookup?domain=${input.trim()}`)
        const json = await res.json()
        if (json.error) throw new Error()
        const score = calcScore({ balance: json.balance, txCount: json.txCount, walletAgeDays: json.walletAgeDays || 0 })
        setData({ ...json, score, domain: input.trim() })
      }
    } catch {
      setError('Not found or invalid')
    }
    setLoading(false)
  }

  return (
    <div style={{ marginTop: 24, padding: 20, background: dark ? '#0a0a14' : '#f4f4fb', borderRadius: 16, border: `1px solid ${border}`, animation: 'fadeSlideIn 0.3s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <p style={{ fontWeight: 800, fontSize: 16, color: textColor, margin: 0 }}>⚖️ Compare Wallets</p>
        <span style={{ fontSize: 11, color: '#7F77DD' }}>side-by-side</span>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <WalletCol
          dark={dark} side="left"
          input={leftInput} onInputChange={setLeftInput}
          onFetch={() => fetchWallet(leftInput, setLeftData, setLeftLoading, setLeftError)}
          loading={leftLoading} error={leftError} data={leftData}
        />
        <div style={{ display: 'flex', alignItems: 'center', color: subColor, fontWeight: 900, fontSize: 18 }}>vs</div>
        <WalletCol
          dark={dark} side="right"
          input={rightInput} onInputChange={setRightInput}
          onFetch={() => fetchWallet(rightInput, setRightData, setRightLoading, setRightError)}
          loading={rightLoading} error={rightError} data={rightData}
        />
      </div>
      {leftData && rightData && (
        <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 10, background: dark ? '#13131f' : '#eeeef8', border: `1px solid ${border}` }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: dark ? '#888' : '#666', marginBottom: 8 }}>VERDICT</p>
          {leftData.score !== rightData.score ? (
            <p style={{ fontSize: 13, color: dark ? '#ccc' : '#333', margin: 0 }}>
              <strong style={{ color: leftData.score > rightData.score ? '#22c55e' : '#ef4444' }}>
                {leftData.domain}
              </strong>
              {' '}scores {Math.abs(leftData.score - rightData.score)} points {leftData.score > rightData.score ? 'higher' : 'lower'} than{' '}
              <strong style={{ color: rightData.score > leftData.score ? '#22c55e' : '#ef4444' }}>
                {rightData.domain}
              </strong>
            </p>
          ) : (
            <p style={{ fontSize: 13, color: dark ? '#ccc' : '#333', margin: 0 }}>Both wallets have identical scores.</p>
          )}
        </div>
      )}
    </div>
  )
}