import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js'

// ── RPC config ─────────────────────────────────────────────────────────────
// IMPORTANT: no NEXT_PUBLIC_ prefix — this file runs server-side only.
// The Alchemy key never touches the client bundle.
// Fallbacks are tried in order if the primary endpoint fails or rate-limits.
const PRIMARY_RPC = process.env.ALCHEMY_RPC_URL

const FALLBACKS = [
  'https://rpc.ankr.com/solana',            // Ankr — generous free tier
  'https://solana-mainnet.rpc.extrnode.com', // Extrnode — reliable free node
  'https://api.mainnet-beta.solana.com',     // Official — last resort, strict limits
]

// Tries primary Alchemy RPC first, then each fallback in order.
// Returns the first healthy Connection or throws if all fail.
async function createConnection() {
  const candidates = PRIMARY_RPC
    ? [PRIMARY_RPC, ...FALLBACKS]
    : FALLBACKS // no key set → skip primary, go straight to free nodes

  for (const url of candidates) {
    try {
      const conn = new Connection(url)
      await conn.getLatestBlockhash() // health check
      return conn
    } catch {
      console.warn(`[analyze] RPC failed, trying next: ${url}`)
    }
  }
  throw new Error('All RPC endpoints failed')
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function isValidSolanaAddress(str) {
  try {
    new PublicKey(str)
    return str.length >= 32 && str.length <= 44
  } catch {
    return false
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const wallet = searchParams.get('wallet')
  const pro = searchParams.get('pro') === 'true'
  let txs = parseInt(searchParams.get('txs')) || (pro ? 50 : 10)

  if (!wallet) {
    return new Response(JSON.stringify({ error: 'wallet required' }), { status: 400 })
  }

  // Reject non-Solana addresses early — avoids wasting RPC calls
  if (!isValidSolanaAddress(wallet)) {
    return new Response(JSON.stringify({ error: 'Invalid Solana wallet address' }), { status: 400 })
  }

  if (txs < 1) txs = 10
  if (txs > 1000) txs = 1000

  // Pro tier uses Alchemy's paid rate → 150ms sleep between calls
  // Free tier is conservative → 3000ms to avoid rate-limiting on public nodes
  const sleepMs = pro ? 150 : 3000

  // ETA in seconds: each tx costs sleepMs + ~500ms RPC overhead
  const etaSeconds = Math.round((txs * (sleepMs + 500)) / 1000)

  // ── SSE Stream ─────────────────────────────────────────────────────────────
  // We stream Server-Sent Events so the client can show live progress.
  // Message types: start | progress | result | error
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data) => {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        // createConnection() handles fallback automatically
        const connection = await createConnection()
        const pubkey = new PublicKey(wallet)

        // Fetch more sigs than requested so we can filter & still hit the target
        const sigLimit = Math.min(1000, txs * 3)
        const sigs = await connection.getSignaturesForAddress(pubkey, { limit: sigLimit })
        const total = Math.min(txs, sigs.length)

        // Wallet age = time since oldest observed transaction
        const oldestSig = sigs[sigs.length - 1]
        const walletAgeDays = oldestSig?.blockTime
          ? Math.floor((Date.now() / 1000 - oldestSig.blockTime) / 86400)
          : 0

        // Send total + ETA so client can render progress bar + countdown
        send({ type: 'start', total, walletAgeDays, etaSeconds })

        const results = sigs.slice(0, total)

        // counterparts: tracks SOL flows between this wallet and each peer
        const counterparts = {}
        // fundingSources: cumulative SOL received from each sender
        const fundingSources = {}
        // fundingTxMap: up to 3 tx signatures per funding source (for deep-link)
        const fundingTxMap = {}
        const roundAmounts = []

        // Velocity tracking — blockTimes of incoming/outgoing SOL transfers
        const inTimestamps = []
        const outTimestamps = []

        // Dust tracking — unique token mints airdropped to this wallet
        const dustTokenMints = new Set()

        for (let i = 0; i < results.length; i++) {
          const sig = results[i]
          try {
            await sleep(sleepMs)
            const tx = await connection.getParsedTransaction(sig.signature, {
              maxSupportedTransactionVersion: 0
            })

            send({ type: 'progress', current: i + 1, total })

            if (!tx?.meta) continue

            for (const ix of tx.transaction.message.instructions) {
              if (ix.program === 'system' && ix.parsed?.type === 'transfer') {
                const { source, destination, lamports } = ix.parsed.info
                const sol = lamports / LAMPORTS_PER_SOL

                if (source === wallet || destination === wallet) {
                  const other = source === wallet ? destination : source
                  counterparts[other] = counterparts[other] || { sent: 0, received: 0, count: 0 }

                  if (source === wallet) {
                    counterparts[other].sent += sol
                    if (sig.blockTime) outTimestamps.push(sig.blockTime)
                  } else {
                    // Incoming — track as funding source
                    counterparts[other].received += sol
                    fundingSources[other] = (fundingSources[other] || 0) + sol
                    if (!fundingTxMap[other]) fundingTxMap[other] = []
                    if (fundingTxMap[other].length < 3) fundingTxMap[other].push(sig.signature)
                    if (sig.blockTime) inTimestamps.push(sig.blockTime)
                  }
                  counterparts[other].count++

                  // Round amounts (0.1, 0.5, 1, 2, 5, 10 SOL) are a sybil signal —
                  // real organic activity rarely transfers perfectly round values
                  if ([0.1, 0.5, 1, 2, 5, 10].includes(parseFloat(sol.toFixed(1)))) {
                    roundAmounts.push({
                      txSignature: sig.signature,
                      counterAddr: other,
                      addr: other.slice(0, 4) + '...' + other.slice(-4),
                      direction: source === wallet ? 'sent' : 'received',
                      sol
                    })
                  }
                }
              }
            }

            // SPL token dust detection — new token mints that appear in this wallet
            // after the tx but weren't there before = airdropped token (potential dust)
            const preMintSet = new Set(
              (tx.meta.preTokenBalances || [])
                .filter(b => b.owner === wallet)
                .map(b => b.mint)
            )
            for (const post of (tx.meta.postTokenBalances || [])) {
              if (post.owner === wallet && !preMintSet.has(post.mint)) {
                dustTokenMints.add(post.mint)
              }
            }

          } catch (e) {
            console.error(`[analyze] Error fetching tx ${sig.signature}:`, e.message)
            send({ type: 'progress', current: i + 1, total })
            continue
          }
        }

        // Quick in-out (velocity) — count incoming SOL transfers that were followed
        // by an outgoing transfer within 1 hour; scripted drainers do this instantly,
        // bots do it within minutes; organic users almost never do it within an hour
        let quickFlipCount = 0
        for (const inT of inTimestamps) {
          if (outTimestamps.some(outT => outT >= inT && outT - inT <= 3600)) {
            quickFlipCount++
          }
        }

        const dustTxCount = dustTokenMints.size

        // ── Circular trading detection ────────────────────────────────────────
        // A wallet that both sent AND received SOL to/from the same address
        // is a strong sybil indicator (wash trading / self-funding pattern)
        const circular = Object.entries(counterparts)
          .filter(([_, v]) => v.sent > 0 && v.received > 0)
          .map(([addr, v]) => ({
            fullAddr: addr,
            addr: addr.slice(0, 4) + '...' + addr.slice(-4),
            sent: v.sent.toFixed(3),
            received: v.received.toFixed(3),
            count: v.count
          }))

        // Top funding sources — sorted by total SOL received, capped at 10
        const fundingGraph = Object.entries(fundingSources)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 10)
          .map(([addr, sol]) => ({
            fullAddr: addr,
            addr: addr.slice(0, 4) + '...' + addr.slice(-4),
            sol: sol.toFixed(3),
            txSignatures: fundingTxMap[addr] || []
          }))

        // ── Wash score formula ────────────────────────────────────────────────
        // circularScore: based on count + volume of circular pairs (max 60)
        // roundScore:    based on number of suspiciously round transfers (max 40)
        // washScore:     combined, capped at 100
        const circularVolume = circular.reduce(
          (sum, c) => sum + parseFloat(c.sent) + parseFloat(c.received), 0
        )
        const circularScore = Math.min(60, circular.length * 8 + Math.min(20, Math.floor(circularVolume / 5) * 5))
        const roundScore = Math.min(40, roundAmounts.length * 3)
        const washScore = Math.min(100, circularScore + roundScore)

        send({
          type: 'result',
          circular,
          roundAmounts,
          fundingGraph,
          washScore,
          walletAgeDays,
          txAnalyzed: total,
          hasCircularActivity: circular.length > 0,
          roundAmountCount: roundAmounts.length,
          quickFlipCount,
          dustTxCount,
          pro,
          rpcUsed: PRIMARY_RPC ? 'alchemy' : 'fallback'
        })

      } catch (e) {
        console.error('[analyze] Fatal error:', e)
        send({ type: 'error', error: 'Analysis failed — RPC error or rate limit' })
      } finally {
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  })
}