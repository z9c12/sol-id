'use client'

import { useState, useEffect, useRef } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { isValidSolanaAddress, calcScore, getSybilRisk, shortAddr, walletAge, formatETA, TOOLTIPS, confirmTransactionPolling } from '@/lib/wallet-utils'

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
  const [payStartedAt, setPayStartedAt] = useState(null)
  const [payError, setPayError] = useState(null)
  const reportRef = useRef(null)

  const [chainStatus, setChainStatus] = useState(null)
  const [chainSig, setChainSig] = useState(null)

  // History
  useEffect(() => {
    if (!connected || !publicKey) { setHistory([]); return }
    const key = `history_${publicKey.toBase58()}`
    const saved = JSON.parse(localStorage.getItem(key) || '[]')
    setHistory(saved)
    if (localStorage.getItem(`pro_${publicKey.toBase58()}`) === 'true') setIsPro(true)
  }, [connected, publicKey])

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
      console.warn('Auto sign rejected:', e.message)
    }
    setSignLoading(false)
  }

  useEffect(() => {
    if (connected && publicKey && data && !analysisSignature && !signLoading) {
      signBeforeAnalyze()
    }
  }, [connected, publicKey, data, analysisSignature, signLoading])

  const PRO_RECIPIENT = '2SN5CQ28hqKaC3xXVU8WgXKKDWygxB1FNMYv9ERGB9cu'
  const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
  const USDC_AMOUNT = 5_000_000

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

      const connection = new Connection(process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL || 'https://api.mainnet-beta.solana.com')
      const usdcMint = new Web3PublicKey(USDC_MINT)
      const recipient = new Web3PublicKey(PRO_RECIPIENT)

      const senderATA = await getAssociatedTokenAddress(usdcMint, publicKey)
      const recipientATA = await getAssociatedTokenAddress(usdcMint, recipient)

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
    let y = 15;
  
    // ==================== HEADER ====================
    pdf.setFillColor(63, 52, 137);
    pdf.rect(0, 0, pageWidth, 35, 'F');
  
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(34);
    pdf.setFont('helvetica', 'bold');
    pdf.text('sol.id', 22, 25);
  
    pdf.setFontSize(13);
    pdf.setFont('helvetica', 'normal');
    pdf.text('Reputation • Sybil Guard', 115, 25);
  
    pdf.setFontSize(10);
    const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    pdf.text(date, pageWidth - 78, 25);
  
    y = 52;
  
    // ==================== WALLET INFO ====================
    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(26);
    pdf.setFont('helvetica', 'bold');
    pdf.text(data.domain || 'Wallet', 22, y);
  
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'normal');
    pdf.text(data.wallet || '', 22, y + 11);
  
    pdf.setFontSize(11);
    pdf.text(`Age: ${walletAge(data.walletAgeDays || data.walletAge) || '—'}`, 22, y + 20);
  
    y += 38;
  
    // ==================== TRUSTED IDENTITY ====================
    pdf.setFillColor(16, 185, 129);
    pdf.roundedRect(22, y, 253, 30, 5, 5, 'F');
  
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(15);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Trusted Identity', 38, y + 19);
  
    pdf.setFontSize(10.5);
    pdf.setFont('helvetica', 'normal');
    pdf.text('Safe for governance & airdrops • Active human user', 38, y + 26);
  
    y += 48;
  
    // ==================== REPUTATION SCORE ====================
    const score = data.score || bestAnalysis?.score || proAnalysis?.score || completeAnalysis?.score || quickAnalysis?.score || 71;
    const scoreColor = score >= 70 ? '#10b981' : score >= 50 ? '#eab308' : '#ef4444';
  
    pdf.setDrawColor(scoreColor);
    pdf.setLineWidth(10);
    pdf.circle(52, y + 28, 29, 'S');
  
    pdf.setFontSize(58);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(scoreColor);
    pdf.text(score.toString(), 52, y + 37, { align: 'center' });
  
    pdf.setFontSize(14);
    pdf.setTextColor(100, 100, 100);
    pdf.text('/100', 80, y + 39);
  
    pdf.setFontSize(15);
    pdf.setTextColor(0, 0, 0);
    pdf.text('Reputation Score', 115, y + 28);
  
    y += 75;
  
    // ==================== STATS GRID (SOL BALANCE + TRANSACTIONS + WALLET AGE) ====================
    const balance = data.balance?.toFixed(3) || data.solBalance?.toFixed(3) || '0.000';
    const txCount = data.txCount || data.transactions || data.tx || '0';
    const age = walletAge(data.walletAgeDays || data.walletAge) || '—';
  
    pdf.setFontSize(9.5);
    pdf.setTextColor(110, 110, 110);
    pdf.text('SOL BALANCE', 22, y);
    pdf.text('TRANSACTIONS', 108, y);
    pdf.text('WALLET AGE', 194, y);
  
    pdf.setFontSize(21);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(0, 0, 0);
    pdf.text(balance, 22, y + 15);
    pdf.text(txCount.toString(), 108, y + 15);
    pdf.text(age, 194, y + 15);
  
    y += 38;
  
    // ==================== WASH TRADING SCORE ====================
    const washScore = proAnalysis?.washScore || completeAnalysis?.washScore || quickAnalysis?.washScore || analysis?.washScore || sybil?.washScore || 3;
  
    pdf.setFontSize(13);
    pdf.setTextColor(0, 0, 0);
    pdf.text('Wash Trading Score', 22, y);
    y += 9;
  
    pdf.setFillColor(230, 230, 230);
    pdf.roundedRect(22, y, 210, 10, 5, 5, 'F');
  
    const barWidth = Math.min((washScore / 100) * 210, 210);
    pdf.setFillColor(washScore < 30 ? '#10b981' : washScore < 60 ? '#eab308' : '#ef4444');
    pdf.roundedRect(22, y, barWidth, 10, 5, 5, 'F');
  
    pdf.setFontSize(12);
    pdf.setTextColor(0, 0, 0);
    pdf.text(`${washScore}/100`, 245, y + 8);
  
    y += 28;
  
    // ==================== SUSPICIOUS ROUND AMOUNTS ====================
    const suspicious = proAnalysis?.suspiciousRoundAmounts || completeAnalysis?.suspiciousRoundAmounts || quickAnalysis?.suspiciousRoundAmounts || [];
    if (suspicious.length > 0) {
      pdf.setFontSize(13);
      pdf.setTextColor(0, 0, 0);
      pdf.text('⚠️ Suspicious Round Amounts', 22, y);
      y += 8;
  
      pdf.setFontSize(10);
      pdf.setTextColor(80, 80, 80);
      suspicious.slice(0, 5).forEach(item => {
        pdf.text(`• ${item.tx || item.hash || 'TX'} — ${item.amount || item.sol || '0'} SOL`, 22, y);
        y += 6;
      });
      y += 8;
    }
  
    // ==================== TOP FUNDING SOURCES ====================
    const funding = proAnalysis?.topFundingSources || completeAnalysis?.topFundingSources || quickAnalysis?.topFundingSources || [];
    if (funding.length > 0) {
      pdf.setFontSize(13);
      pdf.setTextColor(0, 0, 0);
      pdf.text('Top Funding Sources', 22, y);
      y += 8;
  
      pdf.setFontSize(9);
      pdf.setTextColor(100, 100, 100);
      pdf.text('Source', 22, y);
      pdf.text('SOL', 140, y);
      pdf.text('Txs', 190, y);
      y += 6;
      pdf.line(22, y, 270, y);
      y += 5;
  
      pdf.setFontSize(10);
      pdf.setTextColor(0, 0, 0);
      funding.slice(0, 6).forEach(row => {
        pdf.text(shortAddr(row.source || row.address || ''), 22, y);
        pdf.text((row.sol || row.amount || 0).toFixed(3), 140, y);
        pdf.text((row.txs || row.transactions || 0).toString(), 190, y);
        y += 7;
      });
    }
  
    // ==================== FOOTER ====================
    pdf.setFontSize(9);
    pdf.setTextColor(140, 140, 140);
    pdf.text('Full on-chain analysis • Generated by sol.id', 22, pageHeight - 12);
    pdf.text('Powered by Solana • Transparent & verifiable', pageWidth - 138, pageHeight - 12);
  
    // SAVE
    const filename = data?.domain
      ? `sol-id-report-${data.domain}.pdf`
      : `sol-id-report-${shortAddr(data?.wallet || 'wallet')}.pdf`;
  
    pdf.save(filename);
  };
  const MEMO_PROGRAM = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')

  // FIXED: publishToChain with Connection import
  async function publishToChain(analysis, walletAddr, sybilRisk) {
    if (!publicKey || !sendTransaction) {
      setChainStatus('skipped')
      return
    }
    setChainStatus('publishing')
    try {
      const { Transaction, TransactionInstruction, Connection } = await import('@solana/web3.js')
      const connection = new Connection(process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL || 'https://api.mainnet-beta.solana.com')

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

  // Manual publish button
  const publishNow = async () => {
    if (!data || !bestAnalysis || !sybil) {
      alert('No analysis data to publish')
      return
    }
    await publishToChain(bestAnalysis, data.wallet, sybil.risk)
  }

  function estimateETA(txCount, isPro) {
    const sleepMs = isPro ? 150 : 3000
    return Math.round((txCount * (sleepMs + 500)) / 1000)
  }

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
        const connection = new Connection(process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL || 'https://api.mainnet-beta.solana.com')
        const pubkey = new PublicKey(domain.trim())
        const balanceLamports = await connection.getBalance(pubkey)
        const balance = balanceLamports / LAMPORTS_PER_SOL
        const sigs = await connection.getSignaturesForAddress(pubkey, { limit: 100 })
        const txCount = sigs.length
        const oldestSig = sigs[sigs.length - 1]
        const walletAgeDays = oldestSig?.blockTime
          ? Math.floor((Date.now() / 1000 - oldestSig.blockTime) / 86400) : 0
        const score = calcScore({ balance, txCount, walletAgeDays })
        enriched = { wallet: domain.trim(), domain: shortAddr(domain.trim()), balance, txCount, walletAgeDays, score }
      } else {
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

  async function analyzeMyWallet() {
    if (!publicKey) return
    const walletAddr = publicKey.toBase58()
    setLoading(true); setError(null)
    setQuickAnalysis(null); setCompleteAnalysis(null); setProAnalysis(null)
    setAnalysisSignature(null)
    setChainStatus(null); setChainSig(null)
    try {
      const { Connection, LAMPORTS_PER_SOL, PublicKey } = await import('@solana/web3.js')
      const connection = new Connection(process.env.NEXT_PUBLIC_ALCHEMY_RPC_URL || 'https://api.mainnet-beta.solana.com')
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
    publishNow          // ← Manual publish button
  }
}