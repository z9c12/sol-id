'use client'

import { useState, useEffect, useRef } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'

export function useKiraPayment({ data, isPro, onPaymentSuccess }) {
  const { publicKey } = useWallet()

  const [payLoading, setPayLoading] = useState(false)
  const [payError, setPayError] = useState(null)
  const [payElapsed, setPayElapsed] = useState(0)
  const [payRestoring, setPayRestoring] = useState(false)
  const payTimerRef = useRef(null)

  useEffect(() => {
    if (payLoading || payRestoring) {
      setPayElapsed(0)
      payTimerRef.current = setInterval(() => setPayElapsed(s => s + 1), 1000)
    } else {
      clearInterval(payTimerRef.current)
      setPayElapsed(0)
    }
    return () => clearInterval(payTimerRef.current)
  }, [payLoading, payRestoring])

  const sessionKey = (walletAddr) =>
    publicKey ? `kirapay_pending_${publicKey.toBase58()}_${walletAddr}` : null

  const startPolling = (modalOpenedAt, walletAddr, isRestore = false) => {
    const POLL_INTERVAL_MS = 3000
    const deadline = (isRestore ? Date.now() : modalOpenedAt) + 10 * 60 * 1000

    const poll = async () => {
      if (Date.now() > deadline) {
        setPayLoading(false)
        setPayRestoring(false)
        setPayError('Payment window expired. If you paid, click "Verify Payment" to check again.')
        return
      }
      try {
        const res = await fetch(`/api/kirapay-verify?amount=5&after=${modalOpenedAt}`)
        const json = await res.json()
        if (json.verified) {
          onPaymentSuccess(walletAddr)
          setPayLoading(false)
          setPayRestoring(false)
          setPayError(null)
          const sk = sessionKey(walletAddr)
          if (sk) { try { sessionStorage.removeItem(sk) } catch {} }
          return
        }
      } catch (e) {
        console.warn('Poll error:', e)
      }
      setTimeout(poll, POLL_INTERVAL_MS)
    }

    setTimeout(poll, isRestore ? 0 : 3000)
  }

  // Auto-resume polling if a payment was in progress when the page was refreshed
  useEffect(() => {
    if (!data?.wallet || !publicKey || isPro || payLoading || payRestoring) return
    const sk = sessionKey(data.wallet)
    if (!sk) return
    let pending
    try { pending = JSON.parse(sessionStorage.getItem(sk) || 'null') } catch { return }
    if (!pending?.modalOpenedAt) return
    setPayRestoring(true)
    startPolling(pending.modalOpenedAt, data.wallet, true)
  }, [data?.wallet, publicKey])

  const restoreProPayment = () => {
    if (!data?.wallet || !publicKey) return
    const sk = sessionKey(data.wallet)
    if (!sk) return
    let pending
    try { pending = JSON.parse(sessionStorage.getItem(sk) || 'null') } catch { return }
    if (!pending?.modalOpenedAt) return
    setPayRestoring(true)
    setPayError(null)
    startPolling(pending.modalOpenedAt, data.wallet, true)
  }

  const payForPro = async () => {
    if (!publicKey || !data?.wallet) return
    setPayLoading(true)
    setPayError(null)

    try {
      const modalOpenedAt = Date.now()

      const res = await fetch('https://api.kira-pay.com/api/link/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.NEXT_PUBLIC_KIRAPAY_API_KEY,
        },
        body: JSON.stringify({
          tokenOut: { chainId: 'sol', address: 'SOL' },
          receiver: '2SN5CQ28hqKaC3xXVU8WgXKKDWygxB1FNMYv9ERGB9cu',
          originalPrice: 5,
          fiatCurrency: 'USD',
          name: 'sol.id Pro — Deep Analysis Unlock',
          customOrderId: `solid-${publicKey.toBase58().slice(0, 8)}-${data.wallet.slice(0, 8)}-${modalOpenedAt}`,
          type: 'single_use',
        }),
      })

      const json = await res.json()
      if (!res.ok || !json?.data?.url) throw new Error(`KIRAPAY error: ${JSON.stringify(json)}`)

      const sk = sessionKey(data.wallet)
      if (sk) { try { sessionStorage.setItem(sk, JSON.stringify({ modalOpenedAt, wallet: data.wallet })) } catch {} }

      window.open(json.data.url, '_blank')
      startPolling(modalOpenedAt, data.wallet, false)

    } catch (e) {
      console.error('KIRAPAY error:', e.message)
      setPayError('Payment unavailable. Please try again.')
      setPayLoading(false)
    }
  }

  return { payLoading, payError, payElapsed, payRestoring, payForPro, restoreProPayment }
}
