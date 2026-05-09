# sol.id

**On-chain reputation scoring + sybil detection for any .sol identity, wallet, or autonomous agent on Solana.**

Live at: **https://sol-id-iota.vercel.app**

---

## What is sol.id?

sol.id is an identity verification and sybil-detection layer for Solana. It serves two use cases:

- **Social Identity** — Score any `.sol` domain or wallet address. Useful for DAOs, airdrop campaigns, and governance platforms that need to filter sybil wallets.
- **Agent Identity** — A machine-readable trust oracle for autonomous AI agents. Any agent can call `/api/agent` to verify another agent's `.sol` identity and on-chain reputation before transacting.

---

## Features

- 🔍 Lookup any `.sol` domain or raw Solana wallet address
- 📊 Reputation score (0–100) based on on-chain activity
- 💰 Total wallet value in USD — SOL + all SPL tokens via Helius DAS
- 🚨 Sybil detection — circular transfers, round-amount flagging, wash trading score
- 🤖 Agent Identity API — machine-readable trust verdict for autonomous agents
- 📤 On-chain verdict publishing via Solana Memo program
- 📄 PDF report export (Pro)
- ⚖️ Side-by-side wallet comparison
- 🔗 Shareable report links
- 💳 Pro unlock via KIRAPAY — pay with any token from any chain
- 🌙 Dark/light mode

---

## Reputation Score

A number from **0 to 100** computed from three on-chain signals:

```
score = txScore + balScore + ageScore
```

### Transaction Score (max 50 pts)

```
txScore = min(50, round(log10(txCount + 1) × 29))
```

### Balance Score (max 30 pts)

```
balScore = min(30, round(log10(balance × 10 + 1) × 14))
```

Always uses raw SOL balance — not USD value — so the score reflects on-chain behavior, not market value.

### Age Score (max 20 pts)

```
ageScore = min(20, round((walletAgeDays / 365) × 20))
```

---

## Sybil Risk

| Signal | Condition | Risk Points |
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

- Risk ≥ 50 → 🚨 **High Risk**
- Risk ≥ 20 → ⚠️ **Medium Risk**
- Risk < 20 → ✅ **Low Risk**

---

## Wash Trading Score

```
circularScore = min(60, circularCount × 8 + min(20, floor(circularVolume / 5) × 5))
roundScore    = min(40, roundAmountCount × 3)
washScore     = min(100, circularScore + roundScore)
```

---

## Analysis Tiers

| Tier | Transactions | Speed | Features |
|---|---|---|---|
| Free Quick | 10 txs | ~35s | Circular detection, round-amount flagging, sybil score |
| Free Complete | Up to 100 txs | ~6 min | Same as Quick, user-defined depth |
| Pro | Up to 1000 txs | ~1 min | Full analysis, funding graph, wash score, PDF export |

Pro is unlocked via a $5 KIRAPAY payment, scoped per address.

> KIRAPAY merchant activation is pending. A demo unlock button is available in the meantime.

---

## Wallet Value

Total portfolio USD value is powered by the **Helius DAS API** — a single `getAssetsByOwner` call returns SOL balance, all SPL token balances, and live USD prices. SOL and token values are summed into one **Wallet Value** shown on the report card.

Alchemy is used separately for raw SOL balance and transaction data, which feed the reputation score.

---

## Agent Identity API

### `GET /api/agent?domain={domain.sol}`
### `GET /api/agent?wallet={base58_address}`

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

Domain → wallet resolution is cached for 5 minutes. First hit ~4s, subsequent hits ~500ms.

---

## On-Chain Verdict

After analysis, sol.id writes a verdict to Solana via the Memo program (`MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`):

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

Any agent, DAO, or protocol can verify this on-chain without re-running the analysis.

---

## Architecture

```
app/
├── page.js                        # Main UI
├── api/
│   ├── agent/route.js             # Agent Identity API
│   ├── analyze/route.js           # SSE streaming analysis
│   ├── helius-balance/route.js    # Portfolio USD value via Helius DAS
│   ├── kirapay-verify/route.js    # Server-side payment verification
│   ├── lookup/route.js            # SNS domain resolution
│   └── rpc/route.js               # Alchemy RPC proxy
hooks/
└── useSolId.js                    # All state and logic
lib/
└── wallet-utils.js                # Score formula, sybil risk, helpers
```

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
HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_KIRAPAY_API_KEY=your_kirapay_key
KIRAPAY_API_KEY=your_kirapay_key
```

```bash
npm run dev
```

---

## Tech Stack

- **Next.js 16** — App Router, SSE streaming
- **@solana/web3.js** — on-chain data
- **@bonfida/spl-name-service** — SNS domain resolution
- **@solana/wallet-adapter** — wallet connection
- **Alchemy** — RPC provider for transactions and scoring
- **Helius DAS** — portfolio valuation
- **KIRAPAY** — cross-chain payment checkout
- **jsPDF** — PDF report generation

---

## License

MIT