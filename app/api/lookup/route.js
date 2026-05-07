import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { resolve } from '@bonfida/spl-name-service'
import { NextResponse } from 'next/server'

// ── RPC config ─────────────────────────────────────────────────────────────
// No NEXT_PUBLIC_ prefix — server-side only, key never reaches the browser.
// Fallbacks tried in order if Alchemy is down or unset.
const PRIMARY_RPC = process.env.ALCHEMY_RPC_URL

const FALLBACKS = [
  'https://rpc.ankr.com/solana',            // Ankr — generous free tier
  'https://solana-mainnet.rpc.extrnode.com', // Extrnode — reliable free node
  'https://api.mainnet-beta.solana.com',     // Official — last resort, strict limits
]

async function createConnection() {
  const candidates = PRIMARY_RPC ? [PRIMARY_RPC, ...FALLBACKS] : FALLBACKS
  for (const url of candidates) {
    try {
      const conn = new Connection(url)
      await conn.getLatestBlockhash() // health check
      return conn
    } catch {
      console.warn(`[lookup] RPC failed, trying next: ${url}`)
    }
  }
  throw new Error('All RPC endpoints failed')
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const domain = searchParams.get('domain')

  if (!domain) {
    return NextResponse.json({ error: 'domain required' }, { status: 400 })
  }

  try {
    // createConnection() handles fallback automatically
    const connection = await createConnection()

    // Resolve .sol domain → wallet pubkey via Bonfida SNS
    const owner = await resolve(connection, domain)
    const wallet = owner.toBase58()

    const balanceLamports = await connection.getBalance(owner)
    const balance = balanceLamports / LAMPORTS_PER_SOL

    // Fetch up to 1000 sigs to get accurate tx count and wallet age
    const sigs = await connection.getSignaturesForAddress(owner, { limit: 1000 })
    const txCount = sigs.length

    // Wallet age = time since oldest observed transaction
    const oldestSig = sigs[sigs.length - 1]
    const walletAgeDays = oldestSig?.blockTime
      ? Math.floor((Date.now() / 1000 - oldestSig.blockTime) / 86400)
      : 0

    return NextResponse.json({ wallet, balance, txCount, walletAgeDays })
  } catch (e) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
}