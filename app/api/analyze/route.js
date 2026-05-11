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

// ── Program registry ────────────────────────────────────────────────────────
const KNOWN_PROGRAMS = {
  // System (never flag these)
  '11111111111111111111111111111111':              { name: 'System',            category: 'system'   },
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA': { name: 'SPL Token',         category: 'system'   },
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bY': { name: 'Assoc. Token',      category: 'system'   },
  'ComputeBudget111111111111111111111111111111':   { name: 'Compute Budget',    category: 'system'   },
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr': { name: 'Memo',              category: 'system'   },
  'Vote111111111111111111111111111111111111111h':  { name: 'Vote',              category: 'system'   },
  // DEX / Swap
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4': { name: 'Jupiter v6',        category: 'dex'      },
  'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB': { name: 'Jupiter v4',        category: 'dex'      },
  'jupoNjAxXgZ4rjzxzPMP4XXi1TKfbt13wjv6loAQfSp': { name: 'Jupiter',           category: 'dex'      },
  'j1o2qRpjcyUwEvwtcfhEQefh773ZgjxcVRry7LDqg5X': { name: 'Jupiter Limit',     category: 'dex'      },
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': { name: 'Raydium AMM',      category: 'dex'      },
  'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK': { name: 'Raydium CLMM',     category: 'dex'      },
  'routeUGWgWzqBWFcrCfv8tritsqukccJPu3q5GPP3xS':  { name: 'Raydium Route',     category: 'dex'      },
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc': { name: 'Orca Whirlpool',    category: 'dex'      },
  '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP': { name: 'Orca v2',          category: 'dex'      },
  'opnb2LAfJYbRMAHHvqjCwQxanZn7n73iByrpMGDXf9Q': { name: 'OpenBook',          category: 'dex'      },
  'srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX': { name: 'Serum v3',          category: 'dex'      },
  'PhoeNiXZ8ByJGLkxNfZRnkkvHvpNkFe1MgMdCnAZKP8': { name: 'Phoenix',           category: 'dex'      },
  // Staking / LST
  'MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD': { name: 'Marinade',          category: 'staking'  },
  'Jito4APty6n1Lb6KCL2hfRzVqCWpCBSSmfBVdPK97bQb': { name: 'Jito',             category: 'staking'  },
  'SPoo1Ku8WFXoNDMHPsrGSTSG1Y47rzgn41SLUNakuHy': { name: 'Stake Pool',        category: 'staking'  },
  // Lending
  'So1endDq2YkqhipRh3WViPa8hdiSpxWy6z3Z6tMCpAo': { name: 'Solend',            category: 'lending'  },
  'KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD': { name: 'Kamino Lend',       category: 'lending'  },
  '6LtLpnUFNByNXLyCoK9wA2MykKAmQNZKBdY8s47dehDc': { name: 'Kamino',           category: 'lending'  },
  // NFT Marketplaces & Tooling
  'TSWAPaqyCSx2KABk68Shruf4rp7CxcAi9UTjtKEgmbh': { name: 'Tensor',            category: 'nft'      },
  'M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K': { name: 'Magic Eden',        category: 'nft'      },
  'mmm3XBJg5gk8XJa8KVR6La9iSBQSBrmhBhkXxekQZak': { name: 'ME mmm',            category: 'nft'      },
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s': { name: 'Metaplex',          category: 'nft'      },
  'cndy3Z4yapfJBmL3ShUp5exZKqR3z33thTzeNMm2gRZ': { name: 'Candy Machine',     category: 'nft'      },
  'BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY': { name: 'Bubblegum',        category: 'nft'      },
  'p1exdMJcjVao65QdewkaZRUnU6VPSXhus9n2GzWfh98': { name: 'Metaplex Auction',  category: 'nft'      },
  // Perps / Derivatives
  'dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH': { name: 'Drift',             category: 'perps'    },
  'mv3ekLzLbnVPNxjSKvqBpU3ZeZXPQdEC3bp5MDEBG68': { name: 'Mango',             category: 'perps'    },
  'PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu': { name: 'Zeta',              category: 'perps'    },
  // Infrastructure / Naming / Governance
  'namesLPneVptA9Z5rqUDD9tMTWEJwofgaYwp8cawRkX': { name: 'SNS Name Service',  category: 'infra'    },
  'jCebN34bUfdeUYJT13J1yG16XWQpt5ai1yaHAF2VBT3V': { name: 'SNS Registrar',   category: 'infra'    },
  '85iDfUvr3HJyLmWdHmkdGbmFN4QZDRQ8vNxZbhBgsicE': { name: 'Bonfida Vesting', category: 'infra'    },
  'AVNMK6wiGfppdQNg9WKfMRBXefDPGZFh2f3o5tnXpump': { name: 'Bonfida',         category: 'infra'    },
  'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw': { name: 'SPL Governance',  category: 'infra'    },
  'SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf':  { name: 'Squads',          category: 'infra'    },
  'worm2ZoG2kUd4vFXhvjh93UUH596ayRfgQ2MZNuKjJ5':  { name: 'Wormhole',        category: 'infra'    },
  'WnFt12ZrnzZrFZkt2xsNsaNWoQribnuQ5B5FrDbwDhD':  { name: 'Wormhole Token',  category: 'infra'    },
  'mRefx8ypXNSX1KNjAQgvQZ3EWVtCJFAdDZm2JzKGj4':  { name: 'Mango Referral',   category: 'infra'    },
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb':  { name: 'Token-2022',      category: 'system'   },
  // Bridges
  'EqtiqpnWLaUJqj1o6K5G5i9t78bE7ERSPSGRqtBJTxuc': { name: 'Allbridge',       category: 'bridge'   },
  'br1xwubggTiEkHokELrBNKTRY9kAyB79G59fYY3cYVm':  { name: 'deBridge',        category: 'bridge'   },
}

// Known malicious / drainer program IDs (from public security reports)
const MALICIOUS_PROGRAMS = new Set([
  'BEAuFm78ST7R93YY7MBFQDwHWVGcNzmDwFE6KzFGHSvH',
  'GokivDYuQXPZCWRkwMhdH2h91KpDQXBEmpgBgs55bnpH',
  'DUrFkKScMgMykYGNrYBbIabNHNS3bDE8UCFPN9R7MqcR',
  'drainXNfNpkPmWQMiQSPbEdKDATALoqhQ2iQgPpMDLha',
])

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

        // Program profiling (Pro) — track every program invoked
        const programCalls = {}       // programId → count
        const maliciousHits = []      // { programId, name, txSignature }
        const tokenApprovals = []     // { delegate, mint, txSignature }

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

            // Program profiling — scan all top-level + inner instructions
            const allIxs = [
              ...tx.transaction.message.instructions,
              ...(tx.meta.innerInstructions || []).flatMap(i => i.instructions),
            ]
            for (const ix of allIxs) {
              const pid = ix.programId?.toString() || ix.programId
              if (!pid) continue
              programCalls[pid] = (programCalls[pid] || 0) + 1

              // Malicious program hit
              if (MALICIOUS_PROGRAMS.has(pid) && !maliciousHits.find(h => h.programId === pid)) {
                maliciousHits.push({ programId: pid, txSignature: sig.signature })
              }

              // Token approval — wallet delegating authority over its tokens
              if (ix.program === 'spl-token' &&
                  (ix.parsed?.type === 'approve' || ix.parsed?.type === 'approveChecked') &&
                  ix.parsed?.info?.owner === wallet) {
                tokenApprovals.push({
                  delegate: ix.parsed.info.delegate,
                  mint: ix.parsed.info.mint || null,
                  txSignature: sig.signature,
                })
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

        // ── Program profile ───────────────────────────────────────────────────
        const categoryCounts = { dex: 0, staking: 0, lending: 0, nft: 0, perps: 0, infra: 0, bridge: 0, system: 0, unknown: 0 }
        const unknownPrograms = []

        for (const [pid, count] of Object.entries(programCalls)) {
          const known = KNOWN_PROGRAMS[pid]
          if (known) {
            categoryCounts[known.category] = (categoryCounts[known.category] || 0) + count
          } else {
            categoryCounts.unknown += count
            unknownPrograms.push({ programId: pid, count })
          }
        }

        // Legit score: ratio of known protocol calls vs all non-system calls
        // infra + bridge count as legitimate even if not DeFi trading
        const legitCalls = categoryCounts.dex + categoryCounts.staking + categoryCounts.lending + categoryCounts.nft + categoryCounts.perps + categoryCounts.infra + categoryCounts.bridge
        const nonSystemCalls = legitCalls + categoryCounts.unknown
        const defiLegitScore = nonSystemCalls > 0 ? Math.round((legitCalls / nonSystemCalls) * 100) : 0

        // Top unknown programs (sorted by call count, max 5)
        const topUnknownPrograms = unknownPrograms
          .sort((a, b) => b.count - a.count)
          .slice(0, 5)

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
          // Program profiling (richer in Pro due to more txs scanned)
          programProfile: categoryCounts,
          defiLegitScore,
          topUnknownPrograms,
          maliciousPrograms: maliciousHits,
          tokenApprovals: tokenApprovals.slice(0, 10),
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