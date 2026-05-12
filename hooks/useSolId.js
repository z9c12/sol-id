'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { isValidSolanaAddress, calcScore, applyRiskCap, getSybilRisk, getTokenRisk, shortAddr, walletAge, formatETA, TOOLTIPS } from '@/lib/wallet-utils'
import { createConnection } from '@/lib/rpc-client'
import { exportPDF as exportPDFDoc } from '@/lib/export-pdf'
import { useKiraPayment } from './useKiraPayment'
import { useChainPublish } from './useChainPublish'

async function fetchWalletStats(connection, pubkey) {
  const sigs = await connection.getSignaturesForAddress(pubkey, { limit: 1000 })
  const oldest = sigs[sigs.length - 1]
  const walletAgeDays = oldest?.blockTime
    ? Math.floor((Date.now() / 1000 - oldest.blockTime) / 86400)
    : 0
  return { txCount: sigs.length, walletAgeDays }
}

export function useSolId() {
  const { publicKey, connected, signMessage } = useWallet()

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
  const [tokenData, setTokenData] = useState(null)

  const reportRef = { current: null }

  // ── Pro access helpers ───────────────────────────────────────────────────────
  const proKey = (searchedWallet) =>
    publicKey && searchedWallet ? `pro_${publicKey.toBase58()}_${searchedWallet}` : null

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

  // ── Extracted hooks ──────────────────────────────────────────────────────────
  const { chainStatus, chainSig, resetPublish, publishToChain } = useChainPublish()

  const { payLoading, payError, payElapsed, payRestoring, payForPro, restoreProPayment } = useKiraPayment({
    data,
    isPro,
    onPaymentSuccess: setProForAddress,
  })

  // ── History ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!connected || !publicKey) { setHistory([]); return }
    const key = `history_${publicKey.toBase58()}`
    const saved = JSON.parse(localStorage.getItem(key) || '[]')
    setHistory(saved)
  }, [connected, publicKey])

  useEffect(() => {
    if (data?.wallet) setIsPro(isProForAddress(data.wallet))
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
    resetPublish()
  }

  // ── Wallet signing ────────────────────────────────────────────────────────────
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

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const sharedWallet = params.get('wallet')
    if (sharedWallet) {
      setDomain(sharedWallet)
      lookup(sharedWallet)
    }
  }, [])

  const unlockPro = () => {
    if (!data?.wallet) return
    setProForAddress(data.wallet)
    setAnalysisSignature(prev => prev || 'demo')
  }

  // ── Share / Export ────────────────────────────────────────────────────────────
  const shareReport = async () => {
    if (!data) return
    const url = `${window.location.origin}?wallet=${data.wallet}`
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const exportPDF = () => exportPDFDoc({ data, proAnalysis, completeAnalysis, quickAnalysis, tokenData, displayScore })

  // ── On-chain publishing ───────────────────────────────────────────────────────
  const publishNow = async () => {
    if (!data || !bestAnalysis || !sybil) { alert('No analysis data to publish'); return }
    await publishToChain(bestAnalysis, data.wallet, sybil.risk)
  }

  // ── Analysis helpers ──────────────────────────────────────────────────────────
  function estimateETA(txCount, isProMode) {
    const sleepMs = isProMode ? 150 : 3000
    return Math.round((txCount * (sleepMs + 500)) / 1000)
  }

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
                washScore: msg.washScore ?? 0,
                quickFlipCount: msg.quickFlipCount ?? 0,
                dustTxCount: msg.dustTxCount ?? 0,
                junkTokenCount: tokenData?.junkTokenCount ?? 0,
                maliciousProgramCount: msg.maliciousPrograms?.length ?? 0,
                suspiciousApprovalCount: msg.tokenApprovals?.length ?? 0,
                defiLegitScore: msg.defiLegitScore ?? null,
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

  // ── Lookup ────────────────────────────────────────────────────────────────────
  async function lookup(overrideDomain) {
    const input = (overrideDomain || domain).trim()
    if (!input) return
    setLoading(true); setError(null); setData(null)
    setIsPro(false)
    setTokenData(null)
    setQuickAnalysis(null); setCompleteAnalysis(null); setProAnalysis(null)
    setQuickProgress({ current: 0, total: 0 }); setCompleteProgress({ current: 0, total: 0 }); setProProgress({ current: 0, total: 0 })
    resetPublish()
    setAnalysisSignature(null)
    try {
      let enriched
      if (isValidSolanaAddress(input)) {
        const { LAMPORTS_PER_SOL } = await import('@solana/web3.js')
        const connection = await createConnection()
        const pubkey = new PublicKey(input)
        const [balanceLamports, heliusRes, { txCount, walletAgeDays }] = await Promise.all([
          connection.getBalance(pubkey),
          fetch(`/api/helius-balance?wallet=${input}`),
          fetchWalletStats(connection, pubkey),
        ])
        const balance = balanceLamports / LAMPORTS_PER_SOL
        const heliusJson = await heliusRes.json()
        const { totalUsd, tokenCount = 0, junkTokenCount = 0, suspiciousTokens = [] } = heliusJson
        setTokenData({ tokenCount, junkTokenCount, suspiciousTokens })
        const score = calcScore({ balance, txCount, walletAgeDays })
        let hasDomain = false, resolvedDomain = null, domainAgeDays = null
        try {
          const reverseRes = await fetch(`/api/lookup?reverse=${input}`)
          const reverseJson = await reverseRes.json()
          if (!reverseJson.error && reverseJson.domain) {
            hasDomain = true; resolvedDomain = reverseJson.domain; domainAgeDays = reverseJson.domainAgeDays ?? null
          }
        } catch {}
        enriched = { wallet: input, domain: shortAddr(input), balance, walletValueUsd: totalUsd, txCount, walletAgeDays, score, hasDomain, resolvedDomain, domainAgeDays }
      } else {
        const res = await fetch(`/api/lookup?domain=${input}`)
        const json = await res.json()
        if (json.error) throw new Error()
        const score = calcScore({ balance: json.balance, txCount: json.txCount, walletAgeDays: json.walletAgeDays || 0 })
        if (json.wallet) {
          const heliusRes = await fetch(`/api/helius-balance?wallet=${json.wallet}`)
          const heliusJson = await heliusRes.json()
          const { tokenCount = 0, junkTokenCount = 0, suspiciousTokens = [] } = heliusJson
          setTokenData({ tokenCount, junkTokenCount, suspiciousTokens })
        }
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

  async function analyzeMyWallet() {
    if (!publicKey) return
    const walletAddr = publicKey.toBase58()
    setLoading(true); setError(null)
    setIsPro(false)
    setTokenData(null)
    setQuickAnalysis(null); setCompleteAnalysis(null); setProAnalysis(null)
    setAnalysisSignature(null)
    resetPublish()
    try {
      const { LAMPORTS_PER_SOL } = await import('@solana/web3.js')
      const connection = await createConnection()
      const pubkeyObj = new PublicKey(walletAddr)
      const [balanceLamports, heliusRes, { txCount, walletAgeDays }] = await Promise.all([
        connection.getBalance(pubkeyObj),
        fetch(`/api/helius-balance?wallet=${walletAddr}`),
        fetchWalletStats(connection, pubkeyObj),
      ])
      const balance = balanceLamports / LAMPORTS_PER_SOL
      const heliusJson = await heliusRes.json()
      const { totalUsd, tokenCount = 0, junkTokenCount = 0, suspiciousTokens = [] } = heliusJson
      setTokenData({ tokenCount, junkTokenCount, suspiciousTokens })
      const score = calcScore({ balance, txCount, walletAgeDays })
      let hasDomain = false, resolvedDomain = null, domainAgeDays = null
      try {
        const reverseRes = await fetch(`/api/lookup?reverse=${walletAddr}`)
        const reverseJson = await reverseRes.json()
        if (!reverseJson.error && reverseJson.domain) {
          hasDomain = true; resolvedDomain = reverseJson.domain; domainAgeDays = reverseJson.domainAgeDays ?? null
        }
      } catch {}
      const enriched = { wallet: walletAddr, domain: 'My Wallet', balance, walletValueUsd: totalUsd, txCount, walletAgeDays, score, hasDomain, resolvedDomain, domainAgeDays }
      setData(enriched)
      saveToHistory(enriched)
      setIsPro(isProForAddress(walletAddr))
    } catch {
      setError('Failed to fetch wallet data')
    }
    setLoading(false)
  }

  // ── Derived values ────────────────────────────────────────────────────────────
  const bestAnalysis = proAnalysis || completeAnalysis || quickAnalysis

  const tokenRisk = tokenData ? getTokenRisk({
    tokenCount: tokenData.tokenCount,
    junkTokenCount: tokenData.junkTokenCount,
  }) : null

  const sybil = data ? getSybilRisk({
    balance: data.balance, txCount: data.txCount,
    circularCount: bestAnalysis?.circular?.length || 0,
    roundCount: bestAnalysis?.roundAmountCount || 0,
    washScore: bestAnalysis?.washScore || 0,
    quickFlipCount: bestAnalysis?.quickFlipCount || 0,
    dustTxCount: bestAnalysis?.dustTxCount || 0,
    junkTokenCount: tokenData?.junkTokenCount || 0,
    maliciousProgramCount: bestAnalysis?.maliciousPrograms?.length || 0,
    suspiciousApprovalCount: bestAnalysis?.tokenApprovals?.length || 0,
    defiLegitScore: bestAnalysis?.defiLegitScore ?? null,
  }) : null

  const displayScore = data && sybil ? applyRiskCap(data.score, sybil.risk) : data?.score ?? null

  return {
    dark, setDark,
    domain, setDomain,
    data, loading, error,
    displayScore,
    tokenData, tokenRisk,
    showCompare, setShowCompare,
    analysisSignature,
    quickAnalysis, quickAnalyzing, quickProgress, quickETA,
    completeAnalysis, completeAnalyzing, completeProgress, completeETA, customTxs, setCustomTxs,
    isPro,
    proAnalysis, proAnalyzing, proProgress, proETA,
    history,
    copied, setCopied,
    payLoading, payError, payElapsed, payRestoring, restoreProPayment,
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
    publishNow,
  }
}
