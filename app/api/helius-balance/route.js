import { NextResponse } from 'next/server';

const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get('wallet');

  if (!wallet) return NextResponse.json({ error: 'Missing wallet' }, { status: 400 });

  try {
    const res = await fetch(HELIUS_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'getAssetsByOwner',
        params: {
          ownerAddress: wallet,
          page: 1,
          limit: 1000,
          displayOptions: {
            showFungible: true,
            showNativeBalance: true,
          },
        },
      }),
    });

    const data = await res.json();
    const result = data.result;

    const solUsd = result?.nativeBalance?.total_price ?? 0;
    const tokens = (result?.items ?? []).filter(
      (a) => a.interface === 'FungibleToken' || a.interface === 'FungibleAsset'
    );
    const tokensUsd = tokens.reduce(
      (sum, t) => sum + (t.token_info?.price_info?.total_price ?? 0), 0
    );

    const totalUsd = parseFloat((solUsd + tokensUsd).toFixed(2));

    return NextResponse.json({ totalUsd });
  } catch (err) {
    console.error('Helius balance error:', err);
    return NextResponse.json({ error: 'Failed to fetch balance' }, { status: 500 });
  }
}