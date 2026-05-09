import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { resolve } from '@bonfida/spl-name-service'
import { NextResponse } from 'next/server'

const PRIMARY_RPC = process.env.ALCHEMY_RPC_URL
const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL

const FALLBACKS = [
  'https://rpc.ankr.com/solana',
  'https://solana-mainnet.rpc.extrnode.com',
  'https://api.mainnet-beta.solana.com',
]

async function createConnection() {
  const candidates = PRIMARY_RPC ? [PRIMARY_RPC, ...FALLBACKS] : FALLBACKS
  for (const url of candidates) {
    try {
      const conn = new Connection(url)
      await conn.getLatestBlockhash()
      return conn
    } catch {
      console.warn(`[lookup] RPC failed, trying next: ${url}`)
    }
  }
  throw new Error('All RPC endpoints failed')
}

async function getWalletValueUsd(wallet) {
  try {
    const res = await fetch(HELIUS_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'getAssetsByOwner',
        params: {
          ownerAddress: wallet,
          page: 1,
          limit: 1000,
          displayOptions: { showFungible: true, showNativeBalance: true },
        },
      }),
    })
    const data = await res.json()
    const solUsd = data.result?.nativeBalance?.total_price ?? 0
    const tokens = (data.result?.items ?? []).filter(
      (a) => a.interface === 'FungibleToken' || a.interface === 'FungibleAsset'
    )
    const tokensUsd = tokens.reduce((sum, t) => sum + (t.token_info?.price_info?.total_price ?? 0), 0)
    return parseFloat((solUsd + tokensUsd).toFixed(2))
  } catch {
    return 0
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const domain = searchParams.get('domain')
  const reverse = searchParams.get('reverse')

  if (!domain && !reverse) {
    return NextResponse.json({ error: 'domain or reverse required' }, { status: 400 })
  }

  try {
    const connection = await createConnection()

    if (reverse) {
      try {
        const { PublicKey } = await import('@solana/web3.js')
        const { findAll } = await import('@bonfida/spl-name-service')
        const pubkey = new PublicKey(reverse)
        const domains = await findAll(connection, pubkey)
        if (!domains || domains.length === 0) {
          return NextResponse.json({ error: 'no domain' }, { status: 400 })
        }
        return NextResponse.json({ domain: domains[0].domain })
      } catch {
        return NextResponse.json({ error: 'no domain' }, { status: 400 })
      }
    }

    const owner = await resolve(connection, domain)
    const wallet = owner.toBase58()

    // Alchemy for SOL balance — feeds scoring
    const balanceLamports = await connection.getBalance(owner)
    const balance = balanceLamports / LAMPORTS_PER_SOL

    // Helius for USD value — display only
    const walletValueUsd = await getWalletValueUsd(wallet)

    const sigs = await connection.getSignaturesForAddress(owner, { limit: 1000 })
    const txCount = sigs.length
    const oldestSig = sigs[sigs.length - 1]
    const walletAgeDays = oldestSig?.blockTime
      ? Math.floor((Date.now() / 1000 - oldestSig.blockTime) / 86400)
      : 0

    return NextResponse.json({ wallet, balance, walletValueUsd, txCount, walletAgeDays })
  } catch (e) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
}