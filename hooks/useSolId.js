'use client'

import { useState, useEffect, useRef } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { isValidSolanaAddress, calcScore, getSybilRisk, shortAddr, walletAge, formatETA, TOOLTIPS, confirmTransactionPolling } from '@/lib/wallet-utils'

// ── RPC config ─────────────────────────────────────────────────────────────
// Primary: our Next.js proxy (hides Alchemy key, allows server-side caching)
// Fallbacks: tried in order if the previous endpoint fails or rate-limits
const RPC_URL = `${process.env.NEXT_PUBLIC_APP_URL}/api/rpc`

const FALLBACKS = [
  'https://rpc.ankr.com/solana',           // Ankr — generous free tier
  'https://solana-mainnet.rpc.extrnode.com', // Extrnode — reliable free node
  'https://api.mainnet-beta.solana.com',    // Official — last resort, strict limits
]

// Tries each RPC in order, returns the first healthy connection.
// Throws only if all 4 endpoints are unreachable.
async function createConnection() {
  const { Connection } = await import('@solana/web3.js')
  for (const url of [RPC_URL, ...FALLBACKS]) {
    try {
      const conn = new Connection(url)
      await conn.getLatestBlockhash() // health check
      return conn
    } catch {
      console.warn(`RPC failed, trying next: ${url}`)
    }
  }
  throw new Error('All RPC endpoints failed')
}

// ─────────────────────────────────────────────────────────────────────────────
// useSolId — Main hook powering sol.id's wallet reputation & sybil-guard system
//
// Architecture overview:
//   1. Wallet lookup  → fetch on-chain balance, tx count, age → compute score
//   2. Analysis tiers → Quick (10 txs) | Complete (custom) | Pro (all txs, fast)
//   3. SSE streaming  → real-time progress from /api/analyze endpoint
//   4. Chain publish  → write verdict as a Memo tx so it's verifiable on-chain
//   5. PDF export     → jsPDF report generation, no canvas needed
//
// RPC routing:
//   ALL on-chain calls go through /api/rpc (Next.js proxy route).
//   This hides the Alchemy API key from the client bundle and lets us
//   add rate-limiting, caching, or failover in one place.
// ─────────────────────────────────────────────────────────────────────────────

export function useSolId() {
  const { publicKey, connected, sendTransaction, signMessage } = useWallet()

  const [dark, setDark] = useState(true)
  const [domain, setDomain] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showCompare, setShowCompare] = useState(false)

  // analysisSignature — a wallet-signed message that proves the user
  // authorized this analysis request (anti-scraping measure)
  const [analysisSignature, setAnalysisSignature] = useState(null)
  const [signLoading, setSignLoading] = useState(false)

  // ── Analysis state: three tiers (quick / complete / pro) ──────────────────
  const [quickAnalysis, setQuickAnalysis] = useState(null)
  const [quickAnalyzing, setQuickAnalyzing] = useState(false)
  const [quickProgress, setQuickProgress] = useState({ current: 0, total: 0 })
  const [quickETA, setQuickETA] = useState({ seconds: 0, startedAt: null })

  const [completeAnalysis, setCompleteAnalysis] = useState(null)
  const [completeAnalyzing, setCompleteAnalyzing] = useState(false)
  const [completeProgress, setCompleteProgress] = useState({ current: 0, total: 0 })
  const [completeETA, setCompleteETA] = useState({ seconds: 0, startedAt: null })
  const [customTxs, setCustomTxs] = useState('')

  const [isPro, setIsPro] = useState(false)
  const [proAnalysis, setProAnalysis] = useState(null)
  const [proAnalyzing, setProAnalyzing] = useState(false)
  const [proProgress, setProProgress] = useState({ current: 0, total: 0 })
  const [proETA, setProETA] = useState({ seconds: 0, startedAt: null })

  const [history, setHistory] = useState([])
  const [copied, setCopied] = useState(false)
  const [payLoading, setPayLoading] = useState(false)
  const [payStartedAt, setPayStartedAt] = useState(null)
  const [payError, setPayError] = useState(null)
  const reportRef = useRef(null)

  // chainStatus tracks the lifecycle of the on-chain Memo publish:
  // null → 'publishing' → 'done' | 'error' | 'insufficient-sol' | 'timeout' | 'skipped'
  const [chainStatus, setChainStatus] = useState(null)
  const [chainSig, setChainSig] = useState(null)

  // ── History (per connected wallet, stored in localStorage) ────────────────
  useEffect(() => {
    if (!connected || !publicKey) { setHistory([]); return }
    const key = `history_${publicKey.toBase58()}`
    const saved = JSON.parse(localStorage.getItem(key) || '[]')
    setHistory(saved)
    // Restore pro status from localStorage (real gate: on-chain tx check)
    if (localStorage.getItem(`pro_${publicKey.toBase58()}`) === 'true') setIsPro(true)
  }, [connected, publicKey])

  const saveToHistory = (item) => {
    if (!connected || !publicKey) return
    const key = `history_${publicKey.toBase58()}`
    const prev = JSON.parse(localStorage.getItem(key) || '[]')
    // Keep max 5 unique entries, newest first
    const newHistory = [item, ...prev.filter(h => h.wallet !== item.wallet).slice(0, 4)]
    setHistory(newHistory)
    localStorage.setItem(key, JSON.stringify(newHistory))
  }

  const updateHistoryAnalysis = (wallet, analysisKey, analysisData) => {
    if (!connected || !publicKey) return
    const key = `history_${publicKey.toBase58()}`
    setHistory(prev => {
      const updated = prev.map(h => h.wallet === wallet ? { ...h, [analysisKey]: analysisData } : h)
      localStorage.setItem(key, JSON.stringify(updated))
      return updated
    })
  }

  // Restore a previously looked-up wallet from history without re-fetching
  const restoreFromHistory = (item) => {
    setData(item)
    setQuickAnalysis(item.quickAnalysis || null)
    setCompleteAnalysis(item.completeAnalysis || null)
    setProAnalysis(item.proAnalysis || null)
    setQuickProgress({ current: 0, total: 0 })
    setCompleteProgress({ current: 0, total: 0 })
    setProProgress({ current: 0, total: 0 })
    setAnalysisSignature(null)
    setChainStatus(null)
    setChainSig(null)
  }

  // ── Wallet signature before analysis ──────────────────────────────────────
  // We ask the user to sign a message before triggering analysis.
  // This ties the request to a real wallet owner (sybil deterrence),
  // and the signature is forwarded to /api/analyze as proof of intent.
  async function signBeforeAnalyze() {
    if (!publicKey || !signMessage || analysisSignature) return
    setSignLoading(true)
    try {
      const msg = `sol.id analysis request\nWallet: ${data?.wallet}\nTimestamp: ${Date.now()}`
      const encoded = new TextEncoder().encode(msg)
      const sig = await signMessage(encoded)
      const sigHex = Buffer.from(sig).toString('hex')
      setAnalysisSignature(sigHex)
    } catch (e) {
      // User rejected — analysis can still proceed unsigned (reduced trust score)
      console.warn('Auto sign rejected:', e.message)
    }
    setSignLoading(false)
  }

  // Trigger signing automatically once wallet data is loaded
  useEffect(() => {
    if (connected && publicKey && data && !analysisSignature && !signLoading) {
      signBeforeAnalyze()
    }
  }, [connected, publicKey, data, analysisSignature, signLoading])

  // ── Pro unlock via USDC payment ────────────────────────────────────────────
  // Pro tier: 5 USDC → SPL token transfer → on-chain proof → unlock fast analysis
  const PRO_RECIPIENT = '2SN5CQ28hqKaC3xXVU8WgXKKDWygxB1FNMYv9ERGB9cu'
  const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
  const USDC_AMOUNT = 5_000_000 // 5 USDC in micro-units (6 decimals)

  // Dev shortcut: unlock pro without payment (remove in production)
  const unlockPro = () => {
    if (!publicKey) return alert('Please connect your wallet first')
    localStorage.setItem(`pro_${publicKey.toBase58()}`, 'true')
    setIsPro(true)
  }

  const payForPro = async () => {
    if (!publicKey) return alert('Please connect your wallet first')
    setPayLoading(true)
    setPayStartedAt(Date.now())
    setPayError(null)
    try {
      const { Transaction, Connection, PublicKey: Web3PublicKey } = await import('@solana/web3.js')
      const { getAssociatedTokenAddress, createTransferInstruction, getAccount, createAssociatedTokenAccountInstruction } = await import('@solana/spl-token')

      const connection = await createConnection()

      const usdcMint = new Web3PublicKey(USDC_MINT)
      const recipient = new Web3PublicKey(PRO_RECIPIENT)

      const senderATA = await getAssociatedTokenAddress(usdcMint, publicKey)
      const recipientATA = await getAssociatedTokenAddress(usdcMint, recipient)

      // Verify sender has a USDC token account and sufficient balance
      let senderAccount
      try {
        senderAccount = await getAccount(connection, senderATA)
      } catch {
        setPayError('No USDC token account found. Make sure you have USDC in your wallet.')
        setPayLoading(false)
        setPayStartedAt(null)
        return
      }
      if (Number(senderAccount.amount) < USDC_AMOUNT) {
        setPayError(`Insufficient USDC. You need at least 5 USDC (have ${(Number(senderAccount.amount) / 1_000_000).toFixed(2)}).`)
        setPayLoading(false)
        setPayStartedAt(null)
        return
      }

      const tx = new Transaction()
      // Create recipient ATA if it doesn't exist yet (first-time recipient)
      try {
        await getAccount(connection, recipientATA)
      } catch {
        tx.add(createAssociatedTokenAccountInstruction(publicKey, recipientATA, recipient, usdcMint))
      }
      tx.add(createTransferInstruction(senderATA, recipientATA, publicKey, USDC_AMOUNT))

      const { blockhash } = await connection.getLatestBlockhash()
      tx.recentBlockhash = blockhash
      tx.feePayer = publicKey

      const sig = await window.__sendTransaction(tx, connection)
      await confirmTransactionPolling(connection, sig)

      // Persist pro status locally; tx sig is on-chain proof if disputed
      localStorage.setItem(`pro_${publicKey.toBase58()}`, 'true')
      localStorage.setItem(`pro_tx_${publicKey.toBase58()}`, sig)
      setIsPro(true)
    } catch (e) {
      console.error('Payment error:', e)
      setPayError(
        e?.message?.includes('rejected') || e?.message?.includes('cancel')
          ? 'Transaction cancelled.'
          : e?.message || 'Payment failed. Please try again.'
      )
    }
    setPayLoading(false)
    setPayStartedAt(null)
  }

  const shareReport = async () => {
    if (!data) return
    const url = `${window.location.origin}?wallet=${data.wallet}`
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── PDF Export ─────────────────────────────────────────────────────────────
  // Pure jsPDF — no html2canvas / DOM capture needed.
  // Renders score, stats, wash-trading bar, funding sources from in-memory state.
  const exportPDF = async () => {
    if (!data) {
      alert("Run an analysis first before exporting PDF.");
      return;
    }
  
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [297, 210],
    });
  
    const pageWidth = 297;
    const pageHeight = 210;
  
    const checkPage = (neededSpace = 20) => {
      if (y + neededSpace > pageHeight - 15) {
        pdf.addPage();
        y = 20;
      }
    };
  
    let y = 15;
  
    // === Fixed Solscan link helper (accepts full address for URL) ===
    const addSolscanLink = (displayText, x, yPos, fullValue, type = 'address') => {
      if (!fullValue || fullValue.length < 8) return;
      const cleanDisplay = displayText.replace('...', '').trim();
      const width = pdf.getTextWidth(cleanDisplay) + 2;
      const url = type === 'tx'
        ? `https://solscan.io/tx/${fullValue}`
        : `https://solscan.io/address/${fullValue}`;
      pdf.link(x, yPos - 3.5, width, 6.5, { url });
    };
  
    // ── Header ───────────────────────────────────────────────────────────────
    pdf.setFillColor(63, 52, 137);
    pdf.rect(0, 0, pageWidth, 32, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(28);
    pdf.setFont('helvetica', 'bold');
    pdf.text('sol.id', 22, 22);
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'normal');
    pdf.text('Reputation • Sybil Guard', 110, 22);
    pdf.setFontSize(9);
    const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    pdf.text(date, pageWidth - 72, 22);
    y = 44;
  
    // ── Wallet identity ──────────────────────────────────────────────────────
    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(22);
    pdf.setFont('helvetica', 'bold');
    pdf.text(data.domain || shortAddr(data.wallet) || 'Wallet', 22, y);
  
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(80, 80, 80);
  
    const walletAddr = data.wallet || '';
    pdf.text(walletAddr, 22, y + 8);
    addSolscanLink(walletAddr, 22, y + 8, walletAddr, 'address');
  
    pdf.setFontSize(10);
    pdf.text(`Age: ${walletAge(data.walletAgeDays) || '—'}`, 22, y + 16);
    y += 28;
  
    // ── Trust badge ──────────────────────────────────────────────────────────
    const bestAnal = proAnalysis || completeAnalysis || quickAnalysis;
    const score = data.score ?? bestAnal?.score ?? 71;
  
    const riskLevel = bestAnal
      ? getSybilRisk({
          balance: data.balance ?? 0,
          txCount: data.txCount ?? 0,
          circularCount: bestAnal?.circular?.length ?? 0,
          roundCount: bestAnal?.roundAmountCount ?? 0,
          washScore: bestAnal?.washScore ?? 0,
        }).risk
      : score >= 70 ? 'low' : score >= 50 ? 'medium' : 'high';
  
    const risk = riskLevel.toLowerCase();
    const badgeColor = risk === 'low' ? [16, 185, 129] : risk === 'medium' ? [234, 179, 8] : [239, 68, 68];
    const badgeLabel = risk === 'low' ? 'Trusted Identity' : risk === 'medium' ? 'Moderate Risk' : 'High Risk';
    const badgeSub = risk === 'low'
      ? 'Safe for governance & airdrops • Active human user'
      : 'Review recommended before governance or airdrop inclusion';
  
    pdf.setFillColor(...badgeColor);
    pdf.roundedRect(22, y, 253, 22, 4, 4, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(13);
    pdf.setFont('helvetica', 'bold');
    pdf.text(badgeLabel, 36, y + 13);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.text(badgeSub, 36, y + 19);
    y += 32;
  
    // ── Score ring + stats ───────────────────────────────────────────────────
    const scoreColor = score >= 70 ? '#10b981' : score >= 50 ? '#eab308' : '#ef4444';
    pdf.setDrawColor(scoreColor);
    pdf.setLineWidth(8);
    pdf.circle(42, y + 22, 22, 'S');
    pdf.setFontSize(36);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(scoreColor);
    pdf.text(score.toString(), 42, y + 29, { align: 'center' });
    pdf.setFontSize(8);
    pdf.setTextColor(120, 120, 120);
    pdf.text('/ 100', 42, y + 36, { align: 'center' });
  
    pdf.setFontSize(11);
    pdf.setTextColor(30, 30, 30);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Reputation Score', 74, y + 18);
  
    const balance = typeof data.balance === 'number' ? data.balance.toFixed(3) : '0.000';
    const txCount = data.txCount ?? 0;
    const age = walletAge(data.walletAgeDays) || '—';
  
    const stats = [
      { label: 'SOL BALANCE', value: balance, x: 74 },
      { label: 'TRANSACTIONS', value: txCount.toString(), x: 160 },
      { label: 'WALLET AGE', value: age, x: 230 },
    ];
    stats.forEach(({ label, value, x }) => {
      pdf.setFontSize(7.5);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(130, 130, 130);
      pdf.text(label, x, y + 30);
      pdf.setFontSize(16);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(0, 0, 0);
      pdf.text(value, x, y + 40);
    });
    y += 58;
  
    // ── Wash Trading Score ───────────────────────────────────────────────────
    checkPage(30);
    const washScore = bestAnal?.washScore ?? 0;
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(0, 0, 0);
    pdf.text('Wash Trading Score', 22, y);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(130, 130, 130);
    const washLabel = washScore < 30 ? 'Clean' : washScore < 60 ? 'Moderate' : 'Suspicious';
    pdf.text(washLabel, 100, y);
    y += 7;
  
    pdf.setFillColor(220, 220, 220);
    pdf.roundedRect(22, y, 230, 8, 4, 4, 'F');
    const barW = Math.max((washScore / 100) * 230, washScore > 0 ? 8 : 0);
    const [br, bg, bb] = washScore < 30 ? [16, 185, 129] : washScore < 60 ? [234, 179, 8] : [239, 68, 68];
    pdf.setFillColor(br, bg, bb);
    if (barW > 0) pdf.roundedRect(22, y, barW, 8, 4, 4, 'F');
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(0, 0, 0);
    pdf.text(`${washScore}/100`, 258, y + 6);
    y += 22;
  
    // ── Circular Transactions ────────────────────────────────────────────────
    const circular = bestAnal?.circular || [];
    if (circular.length > 0) {
      checkPage(40);
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(0, 0, 0);
      pdf.text(`Circular Transactions Detected: ${circular.length}`, 22, y);
      y += 9;
  
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(80, 80, 80);
  
      circular.slice(0, 6).forEach(item => {
        checkPage(10);
        const short = item.addr || shortAddr(item.fullAddr);
        const count = item.count || 0;
        const sent = Number(item.sent || 0).toFixed(3);
        const received = Number(item.received || 0).toFixed(3);
  
        const line = `• ${short} -> ${count} txs | sent: ${sent} received: ${received} SOL`;
        pdf.text(line, 22, y);
  
        if (item.fullAddr) {
          const prefixWidth = pdf.getTextWidth(line.split(short)[0] || '• ');
          addSolscanLink(short, 22 + prefixWidth, y, item.fullAddr, 'address');
        }
        y += 7;
      });
      y += 8;
    }
  
    // ── Suspicious Round Amounts ─────────────────────────────────────────────
    const roundAmounts = bestAnal?.roundAmounts || [];
    if (roundAmounts.length > 0) {
      checkPage(50);
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(239, 68, 68);
      pdf.text('Suspicious Round Amounts', 22, y);
      y += 8;
  
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(80, 80, 80);
  
      roundAmounts.slice(0, 8).forEach(item => {
        checkPage(9);
        const short = item.addr || shortAddr(item.counterAddr);
        const amount = Number(item.sol || 0).toFixed(4);
        const dir = item.direction === 'sent' ? 'sent to' : 'received from';
  
        const line = `• ${amount} SOL ${dir} ${short}`;
        pdf.text(line, 22, y);
  
        if (item.txSignature) {
          const prefixWidth = pdf.getTextWidth(line.split(short)[0] || '• ');
          addSolscanLink(short, 22 + prefixWidth, y, item.txSignature, 'tx');
        }
        y += 7;
      });
      y += 6;
    }
  
    // ── Top Funding Sources (now matches frontend style) ─────────────────────
    const funding = bestAnal?.fundingGraph || [];
    if (funding.length > 0) {
      checkPage(70);
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(0, 0, 0);
      pdf.text('Top Funding Sources', 22, y);
      y += 8;
  
      // Header
      pdf.setFontSize(8.5);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(130, 130, 130);
      pdf.text('Source', 22, y);
      pdf.text('SOL', 120, y);
      pdf.text('Transactions', 170, y);
      y += 4;
      pdf.setDrawColor(200, 200, 200);
      pdf.line(22, y, 270, y);
      y += 6;
  
      pdf.setFontSize(9);
      pdf.setTextColor(0, 0, 0);
  
      funding.slice(0, 8).forEach(row => {
        checkPage(18);
  
        const short = row.addr || shortAddr(row.fullAddr);
        const sol = Number(row.sol || 0).toFixed(3);
        const txList = row.txSignatures || [];
  
        // Main line: Source + SOL + tx count
        pdf.text(short, 22, y);
        pdf.text(sol, 120, y);
        pdf.text(`${txList.length} txs`, 170, y);
  
        if (row.fullAddr) {
          addSolscanLink(short, 22, y, row.fullAddr, 'address');
        }
        y += 6;
  
        // Show individual transactions (like frontend)
        if (txList.length > 0) {
          pdf.setFontSize(7.5);
          pdf.setTextColor(100, 100, 100);
  
          const txsToShow = txList.slice(0, 3); // show max 3 txs per source
          txsToShow.forEach(txSig => {
            const shortTx = txSig.slice(0, 8) + '...' + txSig.slice(-6);
            const txLine = `   ↳ ${shortTx}`;
            pdf.text(txLine, 28, y);
  
            addSolscanLink(shortTx, 28, y, txSig, 'tx');
            y += 5;
          });
  
          if (txList.length > 3) {
            pdf.text(`   + ${txList.length - 3} more txs`, 28, y);
            y += 5;
          }
  
          pdf.setFontSize(9);
          pdf.setTextColor(0, 0, 0);
          y += 2;
        }
      });
    }
  
    // ── Footer ───────────────────────────────────────────────────────────────
    const totalPages = pdf.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      pdf.setPage(i);
      pdf.setFontSize(8);
      pdf.setTextColor(160, 160, 160);
      pdf.text('Full on-chain analysis • Generated by sol.id', 22, pageHeight - 8);
      pdf.text(`Powered by Solana • Transparent & verifiable | Page ${i}/${totalPages}`, pageWidth - 148, pageHeight - 8);
    }
  
    const filename = data?.domain && !data.domain.startsWith('..')
      ? `sol-id-report-${data.domain}.pdf`
      : `sol-id-report-${shortAddr(data?.wallet || 'wallet')}.pdf`;
  
    pdf.save(filename);
  };
  // ── On-chain Memo publish ──────────────────────────────────────────────────
  // After analysis, we write a compact JSON verdict to the Solana blockchain
  // via the Memo program. This makes the sybil verdict publicly verifiable —
  // anyone can look up this tx and see the risk score we computed.
  const MEMO_PROGRAM = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')

  async function publishToChain(analysis, walletAddr, sybilRisk) {
    if (!publicKey || !sendTransaction) {
      setChainStatus('skipped')
      return
    }
    setChainStatus('publishing')
    try {
      const { Transaction, TransactionInstruction, Connection } = await import('@solana/web3.js')

      const connection = await createConnection()

      // Compact verdict: keep it small to stay within Memo's 566-byte limit
      const verdict = JSON.stringify({
        v: 1, wallet: walletAddr, risk: sybilRisk,
        circular: analysis.circular?.length ?? 0,
        roundTxs: analysis.roundAmountCount ?? 0,
        txAnalyzed: analysis.txAnalyzed ?? 0,
        washScore: analysis.washScore ?? 0,
        ts: Math.floor(Date.now() / 1000), app: 'sol.id'
      })

      const ix = new TransactionInstruction({
        keys: [{ pubkey: publicKey, isSigner: true, isWritable: false }],
        programId: MEMO_PROGRAM,
        data: Buffer.from(verdict, 'utf8')
      })

      const tx = new Transaction().add(ix)
      const { blockhash } = await connection.getLatestBlockhash()
      tx.recentBlockhash = blockhash
      tx.feePayer = publicKey

      const sig = await sendTransaction(tx, connection)
      await confirmTransactionPolling(connection, sig)

      setChainSig(sig)
      setChainStatus('done')
    } catch (e) {
      console.warn('Chain publish failed:', e.message)
      const msg = e.message.toLowerCase()
      if (msg.includes('insufficient') || msg.includes('funds') || msg.includes('balance') || msg.includes('lamports') || msg.includes('fee')) {
        setChainStatus('insufficient-sol')
      } else if (msg.includes('timeout') || msg.includes('confirmation')) {
        setChainStatus('timeout')
      } else {
        setChainStatus('error')
      }
    }
  }

  // Manual re-publish button (in case auto-publish was skipped or failed)
  const publishNow = async () => {
    if (!data || !bestAnalysis || !sybil) {
      alert('No analysis data to publish')
      return
    }
    await publishToChain(bestAnalysis, data.wallet, sybil.risk)
  }

  // ── ETA estimation ─────────────────────────────────────────────────────────
  // Pro tier: 150ms sleep between RPC calls (paid Alchemy plan)
  // Free tier: 3000ms sleep (conservative rate limit)
  function estimateETA(txCount, isPro) {
    const sleepMs = isPro ? 150 : 3000
    return Math.round((txCount * (sleepMs + 500)) / 1000)
  }

  // ── SSE streaming core ─────────────────────────────────────────────────────
  // /api/analyze streams Server-Sent Events so the UI can show live progress.
  // Message types: 'start' | 'progress' | 'result' | 'error'
  async function runSSE(url, setAnalysis, setAnalyzing, setProgress, setETA, historyKey, txCountHint, isProMode) {
    setAnalyzing(true)
    setAnalysis(null)
    setProgress({ current: 0, total: 0 })
    const preETA = estimateETA(txCountHint || 10, isProMode)
    setETA({ seconds: preETA, startedAt: Date.now() })
    try {
      const res = await fetch(url)
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() // keep incomplete last line in buffer
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const msg = JSON.parse(line.slice(6))
            if (msg.type === 'start') {
              setProgress({ current: 0, total: msg.total })
              if (msg.etaSeconds) setETA({ seconds: msg.etaSeconds, startedAt: Date.now() })
            } else if (msg.type === 'progress') {
              setProgress({ current: msg.current, total: msg.total })
            } else if (msg.type === 'result') {
              setAnalysis(msg)
              if (historyKey && data?.wallet) updateHistoryAnalysis(data.wallet, historyKey, msg)
              // Compute sybil risk from result and publish to chain automatically
              const sybilData = getSybilRisk({
                balance: data?.balance ?? 0, txCount: data?.txCount ?? 0,
                circularCount: msg.circular?.length ?? 0,
                roundCount: msg.roundAmountCount ?? 0,
                washScore: msg.washScore ?? 0
              })
              publishToChain(msg, data?.wallet, sybilData.risk)
            } else if (msg.type === 'error') {
              setAnalysis({ error: msg.error })
            }
          } catch {} // skip malformed SSE frames
        }
      }
    } catch {
      setAnalysis({ error: 'Analysis failed — RPC error or rate limit' })
    }
    setAnalyzing(false)
  }

  // ── Analysis tier launchers ────────────────────────────────────────────────

  // Quick: last 10 txs, no signature required, instant results
  const runFreeQuick = (sig) => runSSE(
    `/api/analyze?wallet=${data?.wallet}&pro=false&txs=10&sig=${sig}`,
    setQuickAnalysis, setQuickAnalyzing, setQuickProgress, setQuickETA, 'quickAnalysis', 10, false
  )

  // Complete: user-defined tx count (free tier, slower RPC rate)
  const runFreeComplete = (txs, sig) => runSSE(
    `/api/analyze?wallet=${data?.wallet}&pro=false&txs=${txs}&sig=${sig}`,
    setCompleteAnalysis, setCompleteAnalyzing, setCompleteProgress, setCompleteETA, 'completeAnalysis', txs, false
  )

  // Pro: all transactions, fast Alchemy rate, deep sybil analysis
  const runProAnalysis = (sig) => {
    const maxTxs = data?.txCount || 50
    runSSE(
      `/api/analyze?wallet=${data?.wallet}&pro=true&txs=${maxTxs}&sig=${sig}`,
      setProAnalysis, setProAnalyzing, setProProgress, setProETA, 'proAnalysis', maxTxs, true
    )
  }

  // ── Wallet lookup ──────────────────────────────────────────────────────────
  // Accepts either a .sol domain or a raw base58 address.
  // For addresses: fetch directly via proxy RPC.
  // For domains: hit /api/lookup which resolves SNS → pubkey → enriches data.
  async function lookup() {
    if (!domain.trim()) return
    setLoading(true); setError(null); setData(null)
    setQuickAnalysis(null); setCompleteAnalysis(null); setProAnalysis(null)
    setQuickProgress({ current: 0, total: 0 }); setCompleteProgress({ current: 0, total: 0 }); setProProgress({ current: 0, total: 0 })
    setChainStatus(null); setChainSig(null)
    setAnalysisSignature(null)
    try {
      let enriched
      if (isValidSolanaAddress(domain.trim())) {
        const { Connection, LAMPORTS_PER_SOL, PublicKey } = await import('@solana/web3.js')

        const connection = await createConnection()

        const pubkey = new PublicKey(domain.trim())
        const balanceLamports = await connection.getBalance(pubkey)
        const balance = balanceLamports / LAMPORTS_PER_SOL
        // Fetch up to 100 signatures to determine tx count and wallet age
        const sigs = await connection.getSignaturesForAddress(pubkey, { limit: 100 })
        const txCount = sigs.length
        const oldestSig = sigs[sigs.length - 1]
        const walletAgeDays = oldestSig?.blockTime
          ? Math.floor((Date.now() / 1000 - oldestSig.blockTime) / 86400) : 0
        const score = calcScore({ balance, txCount, walletAgeDays })
        enriched = { wallet: domain.trim(), domain: shortAddr(domain.trim()), balance, txCount, walletAgeDays, score }
      } else {
        // SNS domain resolution handled server-side (avoids CORS + rate limits)
        const res = await fetch(`/api/lookup?domain=${domain.trim()}`)
        const json = await res.json()
        if (json.error) throw new Error()
        const score = calcScore({ balance: json.balance, txCount: json.txCount, walletAgeDays: json.walletAgeDays || 0 })
        enriched = { ...json, score, domain: domain.trim() }
      }
      setData(enriched)
      saveToHistory(enriched)
    } catch {
      setError('Domain not found, invalid address, or RPC error')
    }
    setLoading(false)
  }

  // ── Analyze connected wallet ───────────────────────────────────────────────
  // One-click: loads the currently connected wallet's stats without typing.
  async function analyzeMyWallet() {
    if (!publicKey) return
    const walletAddr = publicKey.toBase58()
    setLoading(true); setError(null)
    setQuickAnalysis(null); setCompleteAnalysis(null); setProAnalysis(null)
    setAnalysisSignature(null)
    setChainStatus(null); setChainSig(null)
    try {
      const { Connection, LAMPORTS_PER_SOL, PublicKey } = await import('@solana/web3.js')

      const connection = await createConnection()

      const balanceLamports = await connection.getBalance(new PublicKey(walletAddr))
      const balance = balanceLamports / LAMPORTS_PER_SOL
      const sigs = await connection.getSignaturesForAddress(new PublicKey(walletAddr), { limit: 100 })
      const txCount = sigs.length
      const oldestSig = sigs[sigs.length - 1]
      const walletAgeDays = oldestSig?.blockTime
        ? Math.floor((Date.now() / 1000 - oldestSig.blockTime) / 86400) : 0
      const score = calcScore({ balance, txCount, walletAgeDays })
      const enriched = { wallet: walletAddr, domain: 'My Wallet', balance, txCount, walletAgeDays, score }
      setData(enriched)
      saveToHistory(enriched)
    } catch {
      setError('Failed to fetch wallet data')
    }
    setLoading(false)
  }

  // ── Derived state ──────────────────────────────────────────────────────────
  // bestAnalysis: use the most complete tier available (pro > complete > quick)
  // sybil: final risk verdict computed from wallet stats + analysis signals
  const bestAnalysis = proAnalysis || completeAnalysis || quickAnalysis
  
  const sybil = data ? getSybilRisk({
    balance: data.balance, txCount: data.txCount,
    circularCount: bestAnalysis?.circular?.length || 0,
    roundCount: bestAnalysis?.roundAmountCount || 0,
    washScore: bestAnalysis?.washScore || 0
  }) : null

  return {
    dark, setDark,
    domain, setDomain,
    data, loading, error,
    showCompare, setShowCompare,
    analysisSignature,
    quickAnalysis, quickAnalyzing, quickProgress, quickETA,
    completeAnalysis, completeAnalyzing, completeProgress, completeETA, customTxs, setCustomTxs,
    isPro,
    proAnalysis, proAnalyzing, proProgress, proETA,
    history,
    copied, setCopied,
    payLoading, payStartedAt, payError,
    reportRef,
    chainStatus, chainSig,
    lookup,
    analyzeMyWallet,
    restoreFromHistory,
    unlockPro,
    payForPro,
    shareReport,
    exportPDF,
    runFreeQuick,
    runFreeComplete,
    runProAnalysis,
    bestAnalysis,
    sybil,
    formatETA,
    walletAge,
    shortAddr,
    TOOLTIPS,
    connected,
    publicKey,
    publishNow
  }
}