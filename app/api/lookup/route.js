import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { resolve } from '@bonfida/spl-name-service'
import { NextResponse } from 'next/server'

const RPC = process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL || 'https://api.mainnet-beta.solana.com'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const domain = searchParams.get('domain')

  try {
    const connection = new Connection(RPC)
    const owner = await resolve(connection, domain)
    const wallet = owner.toBase58()

    const balanceLamports = await connection.getBalance(owner)
    const balance = balanceLamports / LAMPORTS_PER_SOL

    const sigs = await connection.getSignaturesForAddress(owner, { limit: 1000 })
    const txCount = sigs.length

    // Real wallet age from oldest signature blockTime
    const oldestSig = sigs[sigs.length - 1]
    const walletAgeDays = oldestSig?.blockTime
      ? Math.floor((Date.now() / 1000 - oldestSig.blockTime) / 86400)
      : 0

    return NextResponse.json({ wallet, balance, txCount, walletAgeDays })
  } catch (e) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
}