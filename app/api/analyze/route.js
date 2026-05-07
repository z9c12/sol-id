import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js'

const ALCHEMY_RPC = process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL ||
  'https://solana-mainnet.g.alchemy.com/v2/QYkmOaHIF04K9cIicRGgn'

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

  // Validate wallet is a real Solana address
  if (!isValidSolanaAddress(wallet)) {
    return new Response(JSON.stringify({ error: 'Invalid Solana wallet address' }), { status: 400 })
  }

  if (txs < 1) txs = 10
  if (txs > 1000) txs = 1000

  const sleepMs = pro ? 150 : 3000
  // ETA in seconds: each tx costs sleepMs + ~500ms rpc overhead
  const etaSeconds = Math.round((txs * (sleepMs + 500)) / 1000)

  // ─── SSE Stream ────────────────────────────────────────────────────────────
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data) => {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      try {
        const connection = new Connection(ALCHEMY_RPC)
        const pubkey = new PublicKey(wallet)
        const sigLimit = Math.min(1000, txs * 3)
        const sigs = await connection.getSignaturesForAddress(pubkey, { limit: sigLimit })
        const total = Math.min(txs, sigs.length)

        // Real wallet age
        const oldestSig = sigs[sigs.length - 1]
        const walletAgeDays = oldestSig?.blockTime
          ? Math.floor((Date.now() / 1000 - oldestSig.blockTime) / 86400)
          : 0

        // Send total + ETA so client can show progress + countdown
        send({ type: 'start', total, walletAgeDays, etaSeconds })

        const results = sigs.slice(0, total)
        const counterparts = {}
        const roundAmounts = []
        const fundingSources = {}
        // Track tx signatures per funding source for the table
        const fundingTxMap = {}

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
                  } else {
                    counterparts[other].received += sol
                    fundingSources[other] = (fundingSources[other] || 0) + sol
                    // Store tx signatures per funding source (max 3 per source)
                    if (!fundingTxMap[other]) fundingTxMap[other] = []
                    if (fundingTxMap[other].length < 3) fundingTxMap[other].push(sig.signature)
                  }
                  counterparts[other].count++

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
          } catch (e) {
            console.error(`Error fetching tx ${sig.signature}:`, e.message)
            send({ type: 'progress', current: i + 1, total })
            continue
          }
        }

        // Build final results
        const circular = Object.entries(counterparts)
          .filter(([_, v]) => v.sent > 0 && v.received > 0)
          .map(([addr, v]) => ({
            fullAddr: addr,
            addr: addr.slice(0, 4) + '...' + addr.slice(-4),
            sent: v.sent.toFixed(3),
            received: v.received.toFixed(3),
            count: v.count
          }))

        const fundingGraph = Object.entries(fundingSources)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 10)
          .map(([addr, sol]) => ({
            fullAddr: addr,
            addr: addr.slice(0, 4) + '...' + addr.slice(-4),
            sol: sol.toFixed(3),
            // Include up to 3 tx signatures for this funding source
            txSignatures: fundingTxMap[addr] || []
          }))

        const circularVolume = circular.reduce((sum, c) => sum + parseFloat(c.sent) + parseFloat(c.received), 0)
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
          pro,
          rpcUsed: 'alchemy'
        })

      } catch (e) {
        console.error('analyze error:', e)
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