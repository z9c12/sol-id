// app/api/agent/route.js
// Machine-readable trust verdict for AI agent identity verification
// Core primitive for the Agent Identity track — Colosseum Hackathon
// Any autonomous agent can call this endpoint to verify another agent's
// .sol identity and on-chain reputation before transacting

import { NextResponse } from 'next/server'
import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js'
import { resolve } from '@bonfida/spl-name-service'

const PRIMARY_RPC = process.env.ALCHEMY_RPC_URL

// Singleton connection — created once, reused on every request
const connection = new Connection(PRIMARY_RPC || 'https://rpc.ankr.com/solana', {
  commitment: 'confirmed',
})

// In-memory cache — domain → wallet, busts after 5 mins
// First hit: ~5s (SNS resolution), subsequent hits: <500ms
const domainCache = new Map()
const CACHE_TTL = 5 * 60 * 1000

async function resolveWallet(domain) {
  const cached = domainCache.get(domain)
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.wallet
  }
  const owner = await resolve(connection, domain)
  const wallet = owner.toBase58()
  domainCache.set(domain, { wallet, ts: Date.now() })
  return wallet
}

// Same scoring formula as calcScore in lib/wallet-utils.js
function calcScore({ balance, txCount, walletAgeDays = 0 }) {
  const txScore  = txCount > 0      ? Math.min(50, Math.round(Math.log10(txCount + 1) * 29))        : 0
  const balScore = balance > 0      ? Math.min(30, Math.round(Math.log10(balance * 10 + 1) * 14))   : 0
  const ageScore = walletAgeDays > 0 ? Math.min(20, Math.round((walletAgeDays / 365) * 20))         : 0
  return Math.min(100, txScore + balScore + ageScore)
}

// Same risk thresholds as getSybilRisk in lib/wallet-utils.js
function getRisk({ balance, txCount }) {
  let riskScore = 0
  if (txCount < 10)  riskScore += 30
  if (balance < 0.05) riskScore += 20
  if (riskScore >= 50) return 'high'
  if (riskScore >= 20) return 'medium'
  return 'low'
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const wallet = searchParams.get('wallet')
  const domain = searchParams.get('domain')

  if (!wallet && !domain) {
    return NextResponse.json({ error: 'wallet or domain required' }, { status: 400 })
  }

  try {
    // Resolve domain → wallet directly (cached after first hit)
    const resolvedWallet = domain ? await resolveWallet(domain) : wallet
    const pubkey = new PublicKey(resolvedWallet)

    // Fetch balance + sigs in parallel
    const [balanceLamports, sigs] = await Promise.all([
      connection.getBalance(pubkey),
      connection.getSignaturesForAddress(pubkey, { limit: 100 })
    ])

    const balance = balanceLamports / LAMPORTS_PER_SOL
    const txCount = sigs.length
    const oldestSig = sigs[sigs.length - 1]
    const walletAgeDays = oldestSig?.blockTime
      ? Math.floor((Date.now() / 1000 - oldestSig.blockTime) / 86400)
      : 0

    const reputationScore = calcScore({ balance, txCount, walletAgeDays })
    const risk = getRisk({ balance, txCount })
    const trusted = risk === 'low'

    return NextResponse.json({
      wallet: resolvedWallet,
      domain: domain || null,
      trusted,
      risk,                           // 'low' | 'medium' | 'high'
      reputationScore,                // 0-100, matches main UI score
      walletAgeDays,
      txCount,
      balance: balance.toFixed(3),
      verifiedAt: Math.floor(Date.now() / 1000),
      apiVersion: 1,
    })

  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}