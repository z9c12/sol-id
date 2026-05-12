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
- 📊 Reputation score (0–100) based on on-chain activity, capped by sybil risk level
- 💰 Total wallet value in USD — SOL + all SPL tokens via Helius DAS
- 🚨 Sybil detection — circular transfers, round-amount flagging, wash trading score
- ⚡ Quick in-out velocity — flags SOL received and forwarded within 1 hour (drainer/bot pattern)
- 🪤 Dusting scan — detects dust airdrops and wallet-drainer token campaigns
- 🔬 Program Interaction Profile (Pro) — categorizes every on-chain program called: DEX, Staking, Lending, NFT, Perps, Infra, Bridge, Unknown
- ☠️ Malicious program detection (Pro) — red alert when wallet has interacted with known drainer programs
- 📈 DeFi Legitimacy Score (Pro) — ratio of recognized protocol calls vs unknown calls (0–100%)
- 🔓 Token approval detection (Pro) — surfaces `approve` instructions delegating token authority to unknown programs
- 🤖 Agent Identity API — machine-readable trust verdict for autonomous agents
- 📤 On-chain verdict publishing via Solana Memo program
- 📄 PDF report export (Pro) — includes full analysis and token scan section
- ⚖️ Side-by-side wallet comparison
- 🔗 Shareable report links — wallet address links directly to Solscan
- 💳 Pro unlock via KIRAPAY — pay $5 with any token from any chain (cross-chain settlement ~2 min)
- 🌙 Dark/light mode

---

## Reputation Score

A number from **0 to 100** computed from three on-chain signals:

```
score = txScore + balScore + ageScore
```

The raw score is capped by sybil risk level. A confirmed drainer can't score 70 just because it has lots of transactions:

| Sybil Risk | Score Cap |
|---|---|
| High | 30 |
| Medium | 60 |
| Low | None |

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
| Quick in-out (<1h) | 3–9 detected | +15 |
| Quick in-out (<1h) | 10+ detected | +30 |
| Dust airdrops | 5–19 received | +10 |
| Dust airdrops | 20+ received | +20 |
| Junk tokens in portfolio | 11–20 tokens | +15 |
| Junk tokens in portfolio | 20+ tokens | +35 |
| Token approval to unknown program | 1–2 detected | +10 |
| Token approval to unknown program | 3+ detected | +25 |
| Malicious program interaction | Any detected | +60 |
| No protocol activity | DeFi legit < 5% with other signals | +15 |

- Risk ≥ 50 → 🚨 **High Risk**
- Risk ≥ 20 → ⚠️ **Medium Risk**
- Risk < 20 → ✅ **Low Risk**

---

## Token Portfolio Scan (Dusting / Drainer Detection)

Every wallet lookup runs a scan of all SPL tokens via Helius DAS. Tokens with a total USD value below **$0.01** are classified as **junk tokens** — these are almost never purchased intentionally and are overwhelmingly:

- Dust airdropped by drainer campaigns to track or phish the wallet
- Worthless meme coins with no market or liquidity
- Scam "claim" tokens designed to trick users into malicious approvals

| Junk Token Count | Signal | Risk |
|---|---|---|
| 1–3 | Minor dust | Low-warn |
| 4–10 | Spam risk | Medium |
| 11–20 | Elevated drainer risk | Medium |
| 20+ | Active dusting / drainer target | High |

Additionally, if over 60% of all tokens are junk and the wallet holds more than 30 tokens total, a **"Portfolio dominated by junk tokens"** flag is added.

The scan output includes:
- Total token count
- Junk/dust token count
- Risk label (Clean / Minor Dust / Token Spam Risk / Drainer Target)
- List of up to 20 suspicious tokens with name, symbol, and Solscan link

---

## Wash Trading Score

```
circularScore = min(60, circularCount × 8 + min(20, floor(circularVolume / 5) × 5))
roundScore    = min(40, roundAmountCount × 3)
washScore     = min(100, circularScore + roundScore)
```

---

## Program Interaction Profile (Pro)

Every parsed transaction is checked against a registry of ~35 known Solana programs. Each program call is categorized:

| Category | Examples |
|---|---|
| DEX | Jupiter, Raydium, Orca, OpenBook, Phoenix |
| Staking | Marinade, Jito |
| Lending | Solend, Kamino |
| NFT | Tensor, Magic Eden, Metaplex, Bubblegum |
| Perps | Drift, Mango, Zeta |
| Infra | SNS, Bonfida, SPL Governance, Squads, Wormhole |
| Bridge | Allbridge, deBridge |
| Unknown | Any program not in the registry |

```
defiLegitScore = (legitCalls / nonSystemCalls) × 100
```

Where `legitCalls` = DEX + Staking + Lending + NFT + Perps + Infra + Bridge calls.

If a wallet has lots of transactions but none of them touch a known protocol, that's a red flag. Known malicious program interactions trigger a separate alert and add +60 to sybil risk.

---

## Quick In-Out Velocity

For every inbound SOL transfer, we check if an outbound went out within the same hour. Drainers forward instantly. Bots cycle in minutes. Real users almost never do this.

```
quickFlipCount = inbound SOL transfers where an outbound followed within 3600s
```

---

## Analysis Tiers

| Tier | Transactions | Speed | Features |
|---|---|---|---|
| Free Quick | 10 txs | ~35s | Circular detection, round-amount flagging, sybil score |
| Free Complete | Up to 100 txs | ~6 min | Same as Quick, user-defined depth |
| Pro | Up to 1000 txs | ~1 min | Full analysis, funding graph, wash score, PDF export |

Pro is unlocked via a $5 KIRAPAY payment, scoped per address. Payments are accepted in any token from any chain. Cross-chain settlement typically takes ~2 minutes. A demo unlock button is also available for testing.

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
  "tokenCount": 12,
  "junkTokenCount": 1,
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
├── useSolId.js                    # Main orchestration hook
├── useKiraPayment.js              # Payment flow, polling, session recovery
└── useChainPublish.js             # On-chain verdict publishing via Memo program
lib/
├── wallet-utils.js                # Score formula, sybil risk, helpers
├── export-pdf.js                  # PDF report generation
└── rpc-client.js                  # Shared RPC connection with fallbacks
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