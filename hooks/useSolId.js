'use client'

import { useState, useEffect, useRef } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import jsPDF from 'jspdf';
import { isValidSolanaAddress, calcScore, getSybilRisk, shortAddr, walletAge, formatETA, TOOLTIPS, confirmTransactionPolling } from '@/lib/wallet-utils'

// ── RPC config ─────────────────────────────────────────────────────────────
const RPC_URL = `${process.env.NEXT_PUBLIC_APP_URL}/api/rpc`

const FALLBACKS = [
  'https://rpc.ankr.com/solana',
  'https://solana-mainnet.rpc.extrnode.com',
  'https://api.mainnet-beta.solana.com',
]

async function createConnection() {
  const { Connection } = await import('@solana/web3.js')
  for (const url of [RPC_URL, ...FALLBACKS]) {
    try {
      const conn = new Connection(url)
      await conn.getLatestBlockhash()
      return conn
    } catch {
      console.warn(`RPC failed, trying next: ${url}`)
    }
  }
  throw new Error('All RPC endpoints failed')
}

// ─────────────────────────────────────────────────────────────────────────────
// useSolId — Core hook powering sol.id
//
// Pro unlock is per-address:
//   - $5 via KIRAPAY unlocks Pro for the currently searched address only
//   - localStorage key: pro_${connectedWallet}_${searchedAddress}
//   - Searching a new address resets isPro to false
//   - Demo button bypasses payment for current address (judges/demo)
// ─────────────────────────────────────────────────────────────────────────────

export function useSolId() {
  const { publicKey, connected, sendTransaction, signMessage } = useWallet()

  const [dark, setDark] = useState(true)
  const [domain, setDomain] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showCompare, setShowCompare] = useState(false)

  const [analysisSignature, setAnalysisSignature] = useState(null)
  const [signLoading, setSignLoading] = useState(false)

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
  const [payError, setPayError] = useState(null)
  const reportRef = useRef(null)

  const [chainStatus, setChainStatus] = useState(null)
  const [chainSig, setChainSig] = useState(null)

  // ── Pro key helpers (per connected wallet + per searched address) ──────────
  const proKey = (searchedWallet) => {
    if (!publicKey || !searchedWallet) return null
    return `pro_${publicKey.toBase58()}_${searchedWallet}`
  }

  const isProForAddress = (searchedWallet) => {
    const key = proKey(searchedWallet)
    if (!key) return false
    try { return localStorage.getItem(key) === 'true' } catch { return false }
  }

  const setProForAddress = (searchedWallet) => {
    const key = proKey(searchedWallet)
    if (key) { try { localStorage.setItem(key, 'true') } catch {} }
    setIsPro(true)
  }

  // ── History ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!connected || !publicKey) { setHistory([]); return }
    const key = `history_${publicKey.toBase58()}`
    const saved = JSON.parse(localStorage.getItem(key) || '[]')
    setHistory(saved)
  }, [connected, publicKey])

  // When data changes (new address looked up), re-check Pro status for that address
  useEffect(() => {
    if (data?.wallet) {
      setIsPro(isProForAddress(data.wallet))
    }
  }, [data?.wallet, publicKey])

  const saveToHistory = (item) => {
    if (!connected || !publicKey) return
    const key = `history_${publicKey.toBase58()}`
    const prev = JSON.parse(localStorage.getItem(key) || '[]')
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

  const restoreFromHistory = (item) => {
    setData(item)
    setIsPro(isProForAddress(item.wallet))
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
      console.warn('Sign rejected, falling back to demo mode:', e.message)
      setAnalysisSignature('demo')
    }
    setSignLoading(false)
  }

  useEffect(() => {
    if (connected && publicKey && data && !analysisSignature && !signLoading) {
      signBeforeAnalyze()
    }
  }, [connected, publicKey, data, analysisSignature, signLoading])

  // ── Share link auto-lookup ─────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const sharedWallet = params.get('wallet')
    if (sharedWallet) {
      setDomain(sharedWallet)
      lookup(sharedWallet)
    }
  }, [])

  // ── Pro unlock ────────────────────────────────────────────────────────────

  // Demo unlock — bypasses payment, scoped to current searched address only
  const unlockPro = () => {
    if (!data?.wallet) return
    setProForAddress(data.wallet)
    setAnalysisSignature(prev => prev || 'demo')
  }

  // KIRAPAY payment — replaces manual USDC SPL transfer
  // User pays $5 worth of any Solana token → KIRAPAY handles conversion → SOL settled to merchant
  // On success → Pro unlocked for this searched address only
 // ── KIRAPAY payment ───────────────────────────────────────────────────────
  // 1. Renders the KIRAPAY button and programmatically clicks it to open modal
  // 2. Records the timestamp so we can ignore pre-existing transactions
  // 3. Polls /api/kirapay-verify every 3s (server-side, API key stays hidden)
  // 4. On verified → unlocks Pro for this searched address only
  // 5. Stops polling after success or 5 min timeout
  const payForPro = async () => {
    if (!publicKey) return
    if (!data?.wallet) return
    setPayLoading(true)
    setPayError(null)

    const CHECKOUT_URL = 'https://checkout.kira-pay.com/41wb8by1gs'

    try {
      const modalOpenedAt = Date.now()

      // Open KIRAPAY checkout in new tab — user pays with any token
      window.open(CHECKOUT_URL, '_blank')

      // Unlock Pro for this address immediately
      // TODO: once KIRAPAY activates merchant account, remove the line below
      // and uncomment the polling block to verify payment server-side
      setProForAddress(data.wallet)
      setPayLoading(false)

      // ── POLLING (uncomment when KIRAPAY account is activated) ────────────
      // const MAX_WAIT_MS = 5 * 60 * 1000
      // const POLL_INTERVAL_MS = 3000
      // const deadline = modalOpenedAt + MAX_WAIT_MS
      //
      // const poll = async () => {
      //   if (Date.now() > deadline) {
      //     setPayLoading(false)
      //     setPayError('Payment timed out. If you completed payment, refresh and try again.')
      //     return
      //   }
      //   try {
      //     const verifyRes = await fetch(`/api/kirapay-verify?amount=5&after=${modalOpenedAt}`)
      //     const verifyJson = await verifyRes.json()
      //     if (verifyJson.verified) {
      //       setProForAddress(data.wallet)
      //       setPayLoading(false)
      //       setPayError(null)
      //       return
      //     }
      //   } catch (e) {
      //     console.warn('Poll error:', e)
      //   }
      //   setTimeout(poll, POLL_INTERVAL_MS)
      // }
      // setTimeout(poll, 5000)
      // ─────────────────────────────────────────────────────────────────────

      // ── SDK (uncomment when KIRAPAY account is activated) ────────────────
      // const { ButtonDynamicPrice } = await import('kirapay-merchant-sdk/dist/kirapay-merchant-sdk.esm.js')
      // const button = new ButtonDynamicPrice({
      //   price: Number(5),
      //   apiKey: process.env.NEXT_PUBLIC_KIRAPAY_API_KEY,
      //   title: 'Unlock Pro — $5',
      //   receiver: '2SN5CQ28hqKaC3xXVU8WgXKKDWygxB1FNMYv9ERGB9cu',
      //   style: {
      //     backgroundColor: '#3C3489',
      //     color: 'white',
      //     padding: '14px 16px',
      //     fontSize: '15px',
      //     fontWeight: '700',
      //     borderRadius: '12px',
      //     border: 'none',
      //     width: '100%',
      //     cursor: 'pointer',
      //   }
      // })
      // const container = document.getElementById('kirapay-btn-container')
      // if (container) {
      //   container.innerHTML = ''
      //   container.appendChild(button.render())
      //   const trigger = container.querySelector('button')
      //   if (trigger) trigger.click()
      // }
      // ─────────────────────────────────────────────────────────────────────

    } catch (e) {
      console.error('KIRAPAY error:', e.message)
      setPayError('Payment unavailable. Please try again.')
      setPayLoading(false)
    }
  }
  const shareReport = async () => {
    if (!data) return
    const url = `${window.location.origin}?wallet=${data.wallet}`
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── PDF Export ─────────────────────────────────────────────────────────────
  const exportPDF = async () => {
    if (!data) { alert("Run an analysis first before exporting PDF."); return; }

    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [297, 210] });
    const pageWidth = 297;
    const pageHeight = 210;
    const checkPage = (neededSpace = 20) => {
      if (y + neededSpace > pageHeight - 15) { pdf.addPage(); y = 20; }
    };
    let y = 15;

    const addSolscanLink = (displayText, x, yPos, fullValue, type = 'address') => {
      if (!fullValue || fullValue.length < 8) return;
      const width = pdf.getTextWidth(displayText.replace('...', '').trim()) + 2;
      const url = type === 'tx' ? `https://solscan.io/tx/${fullValue}` : `https://solscan.io/address/${fullValue}`;
      pdf.link(x, yPos - 3.5, width, 6.5, { url });
    };

    pdf.setFillColor(63, 52, 137);
    pdf.rect(0, 0, pageWidth, 32, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(28); pdf.setFont('helvetica', 'bold');
    pdf.text('sol.id', 22, 22);
    pdf.setFontSize(12); pdf.setFont('helvetica', 'normal');
    pdf.text('SNS Identity • Sybil Guard • Agent Trust', 110, 22);
    pdf.setFontSize(9);
    pdf.text(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), pageWidth - 72, 22);
    y = 44;

    pdf.setTextColor(0, 0, 0); pdf.setFontSize(22); pdf.setFont('helvetica', 'bold');
    pdf.text(data.domain || shortAddr(data.wallet) || 'Wallet', 22, y);
    pdf.setFontSize(10); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(80, 80, 80);
    pdf.text(data.wallet || '', 22, y + 8);
    addSolscanLink(data.wallet || '', 22, y + 8, data.wallet, 'address');
    pdf.text(`Wallet Age: ${walletAge(data.walletAgeDays) || '—'}`, 22, y + 16);
    y += 28;

    const bestAnal = proAnalysis || completeAnalysis || quickAnalysis;
    const score = data.score ?? bestAnal?.score ?? 71;
    const riskLevel = bestAnal
      ? getSybilRisk({ balance: data.balance ?? 0, txCount: data.txCount ?? 0, circularCount: bestAnal?.circular?.length ?? 0, roundCount: bestAnal?.roundAmountCount ?? 0, washScore: bestAnal?.washScore ?? 0 }).risk
      : score >= 70 ? 'low' : score >= 50 ? 'medium' : 'high';
    const risk = riskLevel.toLowerCase();
    const badgeColor = risk === 'low' ? [16, 185, 129] : risk === 'medium' ? [234, 179, 8] : [239, 68, 68];
    const badgeLabel = risk === 'low' ? 'Trusted Identity' : risk === 'medium' ? 'Moderate Risk' : 'High Risk';
    const badgeSub = risk === 'low' ? 'Safe for governance & airdrops • Verified .sol identity' : 'Review recommended before governance or airdrop inclusion';
    pdf.setFillColor(...badgeColor);
    pdf.roundedRect(22, y, 253, 22, 4, 4, 'F');
    pdf.setTextColor(255, 255, 255); pdf.setFontSize(13); pdf.setFont('helvetica', 'bold');
    pdf.text(badgeLabel, 36, y + 13);
    pdf.setFontSize(9); pdf.setFont('helvetica', 'normal');
    pdf.text(badgeSub, 36, y + 19);
    y += 32;

    const scoreColor = score >= 70 ? '#10b981' : score >= 50 ? '#eab308' : '#ef4444';
    pdf.setDrawColor(scoreColor); pdf.setLineWidth(8);
    pdf.circle(42, y + 22, 22, 'S');
    pdf.setFontSize(36); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(scoreColor);
    pdf.text(score.toString(), 42, y + 29, { align: 'center' });
    pdf.setFontSize(8); pdf.setTextColor(120, 120, 120);
    pdf.text('/ 100', 42, y + 36, { align: 'center' });
    pdf.setFontSize(11); pdf.setTextColor(30, 30, 30); pdf.setFont('helvetica', 'bold');
    pdf.text('Reputation Score', 74, y + 18);
    [
      { label: 'SOL BALANCE', value: typeof data.balance === 'number' ? data.balance.toFixed(3) : '0.000', x: 74 },
      { label: 'TRANSACTIONS', value: (data.txCount ?? 0).toString(), x: 160 },
      { label: 'WALLET AGE', value: walletAge(data.walletAgeDays) || '—', x: 230 },
    ].forEach(({ label, value, x }) => {
      pdf.setFontSize(7.5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(130, 130, 130);
      pdf.text(label, x, y + 30);
      pdf.setFontSize(16); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(0, 0, 0);
      pdf.text(value, x, y + 40);
    });
    y += 58;

    checkPage(30);
    const washScore = bestAnal?.washScore ?? 0;
    pdf.setFontSize(11); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(0, 0, 0);
    pdf.text('Wash Trading Score', 22, y);
    pdf.setFontSize(9); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(130, 130, 130);
    pdf.text(washScore < 30 ? 'Clean' : washScore < 60 ? 'Moderate' : 'Suspicious', 100, y);
    y += 7;
    pdf.setFillColor(220, 220, 220); pdf.roundedRect(22, y, 230, 8, 4, 4, 'F');
    const barW = Math.max((washScore / 100) * 230, washScore > 0 ? 8 : 0);
    const [br, bg, bb] = washScore < 30 ? [16, 185, 129] : washScore < 60 ? [234, 179, 8] : [239, 68, 68];
    pdf.setFillColor(br, bg, bb);
    if (barW > 0) pdf.roundedRect(22, y, barW, 8, 4, 4, 'F');
    pdf.setFontSize(10); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(0, 0, 0);
    pdf.text(`${washScore}/100`, 258, y + 6);
    y += 22;

    const circular = bestAnal?.circular || [];
    if (circular.length > 0) {
      checkPage(40);
      pdf.setFontSize(11); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(0, 0, 0);
      pdf.text(`Circular Transactions Detected: ${circular.length}`, 22, y); y += 9;
      pdf.setFontSize(9); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(80, 80, 80);
      circular.slice(0, 6).forEach(item => {
        checkPage(10);
        const short = item.addr || shortAddr(item.fullAddr);
        const line = `• ${short} -> ${item.count || 0} txs | sent: ${Number(item.sent || 0).toFixed(3)} received: ${Number(item.received || 0).toFixed(3)} SOL`;
        pdf.text(line, 22, y);
        if (item.fullAddr) addSolscanLink(short, 22 + pdf.getTextWidth(line.split(short)[0] || '• '), y, item.fullAddr, 'address');
        y += 7;
      });
      y += 8;
    }

    const roundAmounts = bestAnal?.roundAmounts || [];
    if (roundAmounts.length > 0) {
      checkPage(50);
      pdf.setFontSize(11); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(239, 68, 68);
      pdf.text('Suspicious Round Amounts', 22, y); y += 8;
      pdf.setFontSize(9); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(80, 80, 80);
      roundAmounts.slice(0, 8).forEach(item => {
        checkPage(9);
        const short = item.addr || shortAddr(item.counterAddr);
        const line = `• ${Number(item.sol || 0).toFixed(4)} SOL ${item.direction === 'sent' ? 'sent to' : 'received from'} ${short}`;
        pdf.text(line, 22, y);
        if (item.txSignature) addSolscanLink(short, 22 + pdf.getTextWidth(line.split(short)[0] || '• '), y, item.txSignature, 'tx');
        y += 7;
      });
      y += 6;
    }

    const funding = bestAnal?.fundingGraph || [];
    if (funding.length > 0) {
      checkPage(70);
      pdf.setFontSize(11); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(0, 0, 0);
      pdf.text('Top Funding Sources', 22, y); y += 8;
      pdf.setFontSize(8.5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(130, 130, 130);
      pdf.text('Source', 22, y); pdf.text('SOL', 120, y); pdf.text('Transactions', 170, y); y += 4;
      pdf.setDrawColor(200, 200, 200); pdf.line(22, y, 270, y); y += 6;
      pdf.setFontSize(9); pdf.setTextColor(0, 0, 0);
      funding.slice(0, 8).forEach(row => {
        checkPage(18);
        const short = row.addr || shortAddr(row.fullAddr);
        const txList = row.txSignatures || [];
        pdf.text(short, 22, y); pdf.text(Number(row.sol || 0).toFixed(3), 120, y); pdf.text(`${txList.length} txs`, 170, y);
        if (row.fullAddr) addSolscanLink(short, 22, y, row.fullAddr, 'address');
        y += 6;
        if (txList.length > 0) {
          pdf.setFontSize(7.5); pdf.setTextColor(100, 100, 100);
          txList.slice(0, 3).forEach(txSig => {
            const shortTx = txSig.slice(0, 8) + '...' + txSig.slice(-6);
            pdf.text(`   ↳ ${shortTx}`, 28, y);
            addSolscanLink(shortTx, 28, y, txSig, 'tx'); y += 5;
          });
          if (txList.length > 3) { pdf.text(`   + ${txList.length - 3} more txs`, 28, y); y += 5; }
          pdf.setFontSize(9); pdf.setTextColor(0, 0, 0); y += 2;
        }
      });
    }

    const totalPages = pdf.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      pdf.setPage(i); pdf.setFontSize(8); pdf.setTextColor(160, 160, 160);
      pdf.text('Full on-chain analysis • Generated by sol.id • SNS Identity Track — Colosseum Hackathon', 22, pageHeight - 8);
      pdf.text(`Powered by Solana & SNS | Page ${i}/${totalPages}`, pageWidth - 100, pageHeight - 8);
    }

    pdf.save(data?.domain && !data.domain.startsWith('..')
      ? `sol-id-report-${data.domain}.pdf`
      : `sol-id-report-${shortAddr(data?.wallet || 'wallet')}.pdf`);
  };

  // ── On-chain Memo publish ──────────────────────────────────────────────────
  const MEMO_PROGRAM = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')

  async function publishToChain(analysis, walletAddr, sybilRisk) {
    if (!publicKey || !sendTransaction) { setChainStatus('skipped'); return }
    setChainStatus('publishing')
    try {
      const { Transaction, TransactionInstruction, Connection } = await import('@solana/web3.js')
      const connection = await createConnection()
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

  const publishNow = async () => {
    if (!data || !bestAnalysis || !sybil) { alert('No analysis data to publish'); return }
    await publishToChain(bestAnalysis, data.wallet, sybil.risk)
  }

  // ── ETA estimation ─────────────────────────────────────────────────────────
  function estimateETA(txCount, isPro) {
    const sleepMs = isPro ? 150 : 3000
    return Math.round((txCount * (sleepMs + 500)) / 1000)
  }

  // ── SSE streaming core ─────────────────────────────────────────────────────
  async function runSSE(url, setAnalysis, setAnalyzing, setProgress, setETA, historyKey, txCountHint, isProMode) {
    setAnalyzing(true)
    setAnalysis(null)
    setProgress({ current: 0, total: 0 })
    setETA({ seconds: estimateETA(txCountHint || 10, isProMode), startedAt: Date.now() })
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
        buffer = lines.pop()
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
          } catch {}
        }
      }
    } catch {
      setAnalysis({ error: 'Analysis failed — RPC error or rate limit' })
    }
    setAnalyzing(false)
  }

  // ── Analysis tier launchers ────────────────────────────────────────────────
  const runFreeQuick = (sig) => runSSE(
    `/api/analyze?wallet=${data?.wallet}&pro=false&txs=10&sig=${sig}`,
    setQuickAnalysis, setQuickAnalyzing, setQuickProgress, setQuickETA, 'quickAnalysis', 10, false
  )

  const runFreeComplete = (txs, sig) => runSSE(
    `/api/analyze?wallet=${data?.wallet}&pro=false&txs=${txs}&sig=${sig}`,
    setCompleteAnalysis, setCompleteAnalyzing, setCompleteProgress, setCompleteETA, 'completeAnalysis', txs, false
  )

  const runProAnalysis = (sig) => {
    const maxTxs = data?.txCount || 50
    runSSE(
      `/api/analyze?wallet=${data?.wallet}&pro=true&txs=${maxTxs}&sig=${sig}`,
      setProAnalysis, setProAnalyzing, setProProgress, setProETA, 'proAnalysis', maxTxs, true
    )
  }

  // ── Wallet / domain lookup ─────────────────────────────────────────────────
  async function lookup(overrideDomain) {
    const input = (overrideDomain || domain).trim()
    if (!input) return
    setLoading(true); setError(null); setData(null)
    setIsPro(false) // always reset — Pro is per-address, re-checked after load
    setQuickAnalysis(null); setCompleteAnalysis(null); setProAnalysis(null)
    setQuickProgress({ current: 0, total: 0 }); setCompleteProgress({ current: 0, total: 0 }); setProProgress({ current: 0, total: 0 })
    setChainStatus(null); setChainSig(null)
    setAnalysisSignature(null)
    try {
      let enriched
      if (isValidSolanaAddress(input)) {
        const { Connection, LAMPORTS_PER_SOL, PublicKey } = await import('@solana/web3.js')
        const connection = await createConnection()
        const pubkey = new PublicKey(input)
        const balanceLamports = await connection.getBalance(pubkey)
        const balance = balanceLamports / LAMPORTS_PER_SOL
        const sigs = await connection.getSignaturesForAddress(pubkey, { limit: 100 })
        const txCount = sigs.length
        const oldestSig = sigs[sigs.length - 1]
        const walletAgeDays = oldestSig?.blockTime ? Math.floor((Date.now() / 1000 - oldestSig.blockTime) / 86400) : 0
        const score = calcScore({ balance, txCount, walletAgeDays })
        let hasDomain = false, resolvedDomain = null, domainAgeDays = null
        try {
          const reverseRes = await fetch(`/api/lookup?reverse=${input}`)
          const reverseJson = await reverseRes.json()
          if (!reverseJson.error && reverseJson.domain) {
            hasDomain = true; resolvedDomain = reverseJson.domain; domainAgeDays = reverseJson.domainAgeDays ?? null
          }
        } catch {}
        enriched = { wallet: input, domain: shortAddr(input), balance, txCount, walletAgeDays, score, hasDomain, resolvedDomain, domainAgeDays }
      } else {
        const res = await fetch(`/api/lookup?domain=${input}`)
        const json = await res.json()
        if (json.error) throw new Error()
        const score = calcScore({ balance: json.balance, txCount: json.txCount, walletAgeDays: json.walletAgeDays || 0 })
        enriched = { ...json, score, domain: input, hasDomain: true, resolvedDomain: input, domainAgeDays: json.domainAgeDays ?? null }
      }
      setData(enriched)
      saveToHistory(enriched)
      setIsPro(isProForAddress(enriched.wallet))
    } catch {
      setError('Domain not found, invalid address, or RPC error')
    }
    setLoading(false)
  }

  // ── Analyze connected wallet ───────────────────────────────────────────────
  async function analyzeMyWallet() {
    if (!publicKey) return
    const walletAddr = publicKey.toBase58()
    setLoading(true); setError(null)
    setIsPro(false)
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
      const walletAgeDays = oldestSig?.blockTime ? Math.floor((Date.now() / 1000 - oldestSig.blockTime) / 86400) : 0
      const score = calcScore({ balance, txCount, walletAgeDays })
      let hasDomain = false, resolvedDomain = null, domainAgeDays = null
      try {
        const reverseRes = await fetch(`/api/lookup?reverse=${walletAddr}`)
        const reverseJson = await reverseRes.json()
        if (!reverseJson.error && reverseJson.domain) {
          hasDomain = true; resolvedDomain = reverseJson.domain; domainAgeDays = reverseJson.domainAgeDays ?? null
        }
      } catch {}
      const enriched = { wallet: walletAddr, domain: 'My Wallet', balance, txCount, walletAgeDays, score, hasDomain, resolvedDomain, domainAgeDays }
      setData(enriched)
      saveToHistory(enriched)
      setIsPro(isProForAddress(walletAddr))
    } catch {
      setError('Failed to fetch wallet data')
    }
    setLoading(false)
  }

  // ── Derived state ──────────────────────────────────────────────────────────
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
    payLoading, payError,
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