// lib/wallet-utils.js
import { PublicKey } from '@solana/web3.js'

export function isValidSolanaAddress(str) {
  try {
    new PublicKey(str)
    return str.length >= 32 && str.length <= 44
  } catch {
    return false
  }
}

export function calcScore({ balance, txCount, walletAgeDays = 0 }) {
  const txScore = txCount > 0 ? Math.min(50, Math.round(Math.log10(txCount + 1) * 29)) : 0
  const balScore = balance > 0 ? Math.min(30, Math.round(Math.log10(balance * 10 + 1) * 14)) : 0
  const ageScore = walletAgeDays > 0 ? Math.min(20, Math.round((walletAgeDays / 365) * 20)) : 0
  return Math.min(100, txScore + balScore + ageScore)
}

export function getSybilRisk({ balance, txCount, circularCount = 0, roundCount = 0, washScore = 0 }) {
  const flags = []
  let riskScore = 0
  if (txCount < 10) { flags.push({ text: 'Very few transactions', icon: '⚠️' }); riskScore += 30 }
  if (balance < 0.05) { flags.push({ text: 'Near-zero SOL balance', icon: '💸' }); riskScore += 20 }
  if (circularCount >= 10) { flags.push({ text: `${circularCount} circular transfers — strong sybil signal`, icon: '🔄' }); riskScore += 40 }
  else if (circularCount >= 3) { flags.push({ text: `${circularCount} circular transfers detected`, icon: '🔄' }); riskScore += 20 }
  else if (circularCount >= 1) { flags.push({ text: `${circularCount} circular transfer(s) — minor signal`, icon: '🔄' }); riskScore += 8 }
  if (roundCount >= 10) { flags.push({ text: `${roundCount} round-amount transfers — likely scripted`, icon: '🎯' }); riskScore += 25 }
  else if (roundCount >= 5) { flags.push({ text: `${roundCount} suspicious round-amount transfers`, icon: '🎯' }); riskScore += 12 }
  if (washScore >= 70) { flags.push({ text: `High wash trading score (${washScore}/100)`, icon: '🧹' }); riskScore += 20 }
  else if (washScore >= 40) { flags.push({ text: `Elevated wash trading score (${washScore}/100)`, icon: '🧹' }); riskScore += 8 }

  if (riskScore >= 50) return {
    risk: 'high', label: 'High Sybil Risk', verdict: 'Likely Airdrop Farmer — Avoid for governance',
    color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.25)',
    emoji: '🚨', flags, recommendation: 'Multiple sybil indicators detected. Not recommended for trust-sensitive applications.'
  }
  if (riskScore >= 20) return {
    risk: 'medium', label: 'Suspicious Wallet', verdict: 'Review before trusting',
    color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)',
    emoji: '⚠️', flags, recommendation: 'Some risk signals present. Use caution for governance or allowlists.'
  }
  return {
    risk: 'low', label: 'Trusted Identity', verdict: 'Safe for governance & airdrops',
    color: '#22c55e', bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.25)',
    emoji: '✅', flags, recommendation: 'Active human user with healthy on-chain history.'
  }
}

export function shortAddr(addr) {
  return addr ? addr.slice(0, 4) + '...' + addr.slice(-4) : ''
}

export function walletAge(days) {
  if (!days || days <= 0) return 'Unknown'
  if (days >= 365) return `${Math.floor(days / 365)}y ${Math.floor((days % 365) / 30)}m`
  if (days >= 30) return `${Math.floor(days / 30)} months`
  if (days >= 7) return `${Math.floor(days / 7)} weeks`
  return `${days} days`
}

export function formatETA(seconds) {
  if (seconds < 60) return `~${seconds}s`
  const m = Math.floor(seconds / 60), s = seconds % 60
  return s > 0 ? `~${m}m ${s}s` : `~${m}m`
}

export const TOOLTIPS = {
  score: 'Reputation score (0–100) based on wallet age, SOL balance, and transaction history. Higher = more trusted.',
  balance: 'Current SOL balance. Wallets with < 0.05 SOL are flagged as suspicious.',
  txCount: 'Total on-chain transactions. Active wallets typically have 100+ transactions.',
  walletAge: 'Days since first recorded transaction. Older wallets are more trusted.',
  circular: 'Addresses that both sent to and received from this wallet — a common sybil farming pattern.',
  roundAmounts: 'Transfers of round numbers (0.1, 0.5, 1, 2, 5, 10 SOL) that may indicate scripted activity.',
  washScore: 'Likelihood of wash trading or circular activity, combining multiple signals (0–100).',
  fundingSources: 'Accounts that have sent SOL to this wallet. Many wallets funded by the same source = sybil cluster.',
}

export async function confirmTransactionPolling(connection, signature, timeoutMs = 60000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const status = await connection.getSignatureStatus(signature, { searchTransactionHistory: true })
    const conf = status?.value?.confirmationStatus
    if (conf === 'confirmed' || conf === 'finalized') return true
    if (status?.value?.err) throw new Error('Transaction failed on-chain')
    await new Promise(r => setTimeout(r, 2000))
  }
  throw new Error('Transaction confirmation timeout')
}