'use client'

import { useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { PublicKey } from '@solana/web3.js'
import { createConnection } from '@/lib/rpc-client'
import { confirmTransactionPolling } from '@/lib/wallet-utils'

const MEMO_PROGRAM = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')

export function useChainPublish() {
  const { publicKey, sendTransaction } = useWallet()
  const [chainStatus, setChainStatus] = useState(null)
  const [chainSig, setChainSig] = useState(null)

  const resetPublish = () => {
    setChainStatus(null)
    setChainSig(null)
  }

  const publishToChain = async (analysis, walletAddr, sybilRisk) => {
    if (!publicKey || !sendTransaction) { setChainStatus('skipped'); return }
    setChainStatus('publishing')
    try {
      const { Transaction, TransactionInstruction } = await import('@solana/web3.js')
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

  return { chainStatus, chainSig, resetPublish, publishToChain }
}
