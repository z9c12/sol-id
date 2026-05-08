# sol.id

**On-chain reputation scoring + sybil detection for any .sol identity, wallet, or autonomous agent on Solana.**

Built for the [SNS Identity Track](https://earn.superteam.fun) and [KIRAPAY Track](https://earn.superteam.fun) at the Colosseum Frontier Hackathon, powered by SNS, Superteam MY, MagicBlock, and KIRAPAY.

Live at: **https://sol-id-iota.vercel.app**

---

## What is sol.id?

sol.id is an identity verification and sybil-detection layer for Solana. It serves two tracks:

- **Social Identity** — Score any `.sol` domain or wallet address. Useful for DAOs, airdrop campaigns, and governance platforms that need to filter sybil wallets.
- **Agent Identity** — A machine-readable trust oracle for autonomous AI agents. Any agent can call `/api/agent` to verify another agent's `.sol` identity and on-chain reputation before transacting.

---

## Features

- 🔍 Lookup any `.sol` domain or raw Solana wallet address
- 📊 Reputation score (0–100) based on on-chain activity
- 🚨 Sybil detection — circular transfers, round-amount flagging, wash trading score
- 🤖 Agent Identity API — machine-readable trust verdict for autonomous agents
- 📤 On-chain verdict publishing via Solana Memo program
- 📄 PDF report export (Pro)
- ⚖️ Side-by-side wallet comparison
- 🔗 Shareable report links
- 💳 Pro unlock via KIRAPAY — pay with any token from any chain
- 🌙 Dark/light mode

---

## How the Reputation Score is Calculated

The reputation score is a number from **0 to 100** computed from three on-chain signals:

```
score = txScore + balScore + ageScore
```

### Transaction Score (max 50 pts)
```
txScore = min(50, round(log10(txCount + 1) × 29))
```
Uses a logarithmic scale so the score grows quickly for new wallets but plateaus for very active ones. A wallet with 10 txs scores ~29, 100 txs scores ~58 (capped at 50).

### Balance Score (max 30 pts)
```
balScore = min(30, round(log10(balance × 10 + 1) × 14))
```
SOL balance is also log-scaled. Near-zero balance wallets score 0. A wallet with 1 SOL scores ~14, 10 SOL scores ~24.

### Age Score (max 20 pts)
```
ageScore = min(20, round((walletAgeDays / 365) × 20))
```
Linear scale — a 1-year-old wallet gets the full 20 points. Wallets under 30 days get very few points.

---

## How Sybil Risk is Determined

After the reputation score, sol.id computes a **risk score** from behavioral signals:

| Signal | Condition | Risk Points Added |
|---|---|---|
| Low activity | txCount < 10 | +30 |
| Near-zero balance | balance < 0.05 SOL | +20 |
| Circular transfers | 1–2 detected | +8 |
| Circular transfers | 3–9 detected | +20 |
| Circular transfers | 10+ detected | +40 |
| Round-amount transfers | 5–9 detected | +12 |
| Round-amount transfers | 10+ detected | +25 |
| Elevated wash score | 40–69 / 100 | +8 |
| High wash score | 70+ / 100 | +20 |

**Final verdict:**
- Risk score ≥ 50 → 🚨 **High Risk** — Likely sybil/airdrop farmer
- Risk score ≥ 20 → ⚠️ **Medium Risk** — Review before trusting
- Risk score < 20 → ✅ **Low Risk** — Trusted identity

---

## How the Wash Trading Score is Calculated

The wash score (0–100) combines two components:

```
circularScore = min(60, circularCount × 8 + min(20, floor(circularVolume / 5) × 5))
roundScore    = min(40, roundAmountCount × 3)
washScore     = min(100, circularScore + roundScore)
```

- **Circular transfers** — a wallet that both sent AND received SOL to/from the same address is a strong sybil signal
- **Round amounts** — transfers of exactly 0.1, 0.5, 1, 2, 5, or 10 SOL are flagged as likely scripted activity

---

## Analysis Tiers

| Tier | Transactions | Speed | Features |
|---|---|---|---|
| Free Quick | 10 txs | ~35s | Circular detection, round-amount flagging, basic sybil score |
| Free Complete | Up to 100 txs | ~6 min | Same as Quick, user-defined depth |
| Pro | All txs (up to 1000) | ~1 min | Full analysis, funding graph, wash score, PDF export |

**Pro** is unlocked via a $5 payment through KIRAPAY. Users can pay with any supported token — no need to hold a specific token. Pro is scoped per-address: each wallet you analyze requires a separate Pro unlock.

> **Note:** KIRAPAY merchant account activation is pending. A demo unlock button is available for judges to test all Pro features without payment.

---

## KIRAPAY Integration

sol.id uses [KIRAPAY](https://kira-pay.com) for Pro unlock payments:

- Users pay $5 to unlock Pro analysis for a specific wallet address
- Payment opens the KIRAPAY checkout — compatible with 700+ wallets across any blockchain
- Pro is scoped per-address (`localStorage` key: `pro_${connectedWallet}_${searchedAddress}`)
- Payment verification is handled server-side via `/api/kirapay-verify` — the API key never reaches the client

**Files:**
- `hooks/useSolId.js` — `payForPro()` function handles checkout + Pro unlock
- `app/api/kirapay-verify/route.js` — server-side payment verification via KIRAPAY Transactions API

---

## On-Chain Verdict Publishing

After analysis, sol.id writes a compact JSON verdict to the Solana blockchain via the **Memo program** (`MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`).

The verdict payload:
```json
{
  "v": 1,
  "wallet": "Fw1ETanDZafof...",
  "risk": "low",
  "circular": 0,
  "roundTxs": 2,
  "txAnalyzed": 42,
  "washScore": 6,
  "ts": 1778180369,
  "app": "sol.id"
}
```

This makes the sybil verdict **publicly verifiable on-chain** — any agent, DAO, or protocol can look up this transaction and trust the score without re-running the analysis.

---

## Agent Identity API

sol.id exposes a machine-readable endpoint purpose-built for autonomous agents:

### `GET /api/agent?domain={domain.sol}`
### `GET /api/agent?wallet={base58_address}`

**Response:**
```json
{
  "wallet": "Fw1ETanDZafof7xEULsnq9UY6o71Tpds89tNwPkWLb1v",
  "domain": "bonfida",
  "trusted": true,
  "risk": "low",
  "reputationScore": 71,
  "walletAgeDays": 290,
  "txCount": 42,
  "balance": "0.292",
  "verifiedAt": 1778180369,
  "apiVersion": 1
}
```

**Fields:**
- `trusted` — boolean, safe for agent-to-agent interaction
- `risk` — `low` | `medium` | `high`
- `reputationScore` — 0–100, same formula as the main UI
- `walletAgeDays` — age of the wallet since first transaction
- `txCount` — total transactions observed (up to 100)
- `balance` — SOL balance at time of check
- `verifiedAt` — Unix timestamp of when the check was performed
- `apiVersion` — for forward compatibility

**Caching:** Domain → wallet resolution is cached for 5 minutes to reduce latency on repeated calls. First hit ~4s, subsequent hits ~500ms.

---

## SNS Integration

sol.id is built on top of [Bonfida SNS](https://sns.id):

- **Forward lookup** — resolves any `.sol` domain to its wallet owner via `@bonfida/spl-name-service`
- **Reverse lookup** — given a raw wallet address, checks if it has a `.sol` domain
- All SNS resolution happens server-side on `/api/lookup` to keep RPC keys off the client

---

## Architecture

```
app/
├── page.js                        # Main UI — lookup, report card, agent verdict
├── api/
│   ├── agent/route.js             # Agent Identity API — fast trust verdict
│   ├── analyze/route.js           # SSE streaming analysis endpoint
│   ├── kirapay-verify/route.js    # Server-side KIRAPAY payment verification
│   ├── lookup/route.js            # SNS domain resolution + wallet data
│   └── rpc/route.js               # RPC proxy — hides Alchemy key from client
hooks/
└── useSolId.js                    # All state and logic for the UI
lib/
└── wallet-utils.js                # Score formula, sybil risk, helpers
```

**RPC routing:** All on-chain calls are proxied through `/api/rpc` which uses Alchemy as the primary endpoint with 3 public fallbacks (Ankr, Extrnode, Solana mainnet-beta). The Alchemy key never reaches the client bundle.

**SSE streaming:** The `/api/analyze` endpoint streams `Server-Sent Events` so the UI can show real-time progress as transactions are fetched and analyzed one by one.

---

## Running Locally

```bash
git clone https://github.com/z9c12/sol-id
cd sol-id
npm install
```

Create `.env.local`:
```
ALCHEMY_RPC_URL=https://solana-mainnet.g.alchemy.com/v2/YOUR_KEY
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_KIRAPAY_API_KEY=your_kirapay_api_key_here
KIRAPAY_API_KEY=your_kirapay_api_key_here
```

```bash
npm run dev
```

Open `http://localhost:3000`

---

## Tech Stack

- **Next.js 16** (App Router, SSE streaming)
- **@solana/web3.js** — on-chain data
- **@bonfida/spl-name-service** — SNS domain resolution
- **@solana/wallet-adapter** — wallet connection
- **kirapay-merchant-sdk** — cross-chain payment checkout
- **jsPDF** — PDF report generation
- **Alchemy** — primary RPC provider

---

## Hackathon Tracks

Built for the Colosseum Frontier Hackathon (May 2026).

**SNS Identity Track** — powered by SNS, Superteam MY, and MagicBlock:
- ✅ On-chain reputation system using `.sol` as the identity primitive
- ✅ Sybil resistance tool for DAOs and airdrop campaigns
- ✅ Agent identity layer — autonomous agents can verify each other via API
- ✅ On-chain verifiable verdicts via Solana Memo program
- ✅ Social identity — `.sol` as the universal login and trust layer

**KIRAPAY Track** — Build with KIRAPAY:
- ✅ KIRAPAY SDK integrated for Pro unlock payments
- ✅ Cross-chain checkout — users pay with any token from any blockchain
- ✅ Server-side payment verification via KIRAPAY Transactions API
- ✅ Per-address Pro unlock — real revenue model, not a demo
- ✅ KIRAPAY is core to the product, not an add-on

---

## License

MIT