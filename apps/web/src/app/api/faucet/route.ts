import { NextResponse } from 'next/server'
import { createWalletClient, createPublicClient, http, parseUnits, defineChain } from 'viem'
import { CONTRACTS, RPC_URL, IS_LOCAL, CHAIN_ID } from '@/config/chains'
import { ERC20_ABI } from '@/config/contracts'

// Define local anvil chain
const anvilChain = defineChain({
  id: CHAIN_ID,
  name: 'Anvil',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
  },
})

// Whale address holding $ANON (used via Anvil impersonation for funding)
const WHALE_ADDRESS = '0x8117efF53BA83D42408570c69C6da85a2Bb6CA05' as const

// Amount to send: 1000 ANON
const FAUCET_AMOUNT = parseUnits('1000', 18)

export async function POST(request: Request) {
  // Only allow in local dev mode
  if (!IS_LOCAL) {
    return NextResponse.json({ error: 'Faucet only available in local dev mode' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { recipient } = body

    if (!recipient || typeof recipient !== 'string') {
      return NextResponse.json({ error: 'Missing recipient address' }, { status: 400 })
    }

    if (!CONTRACTS.ANON_TOKEN) {
      return NextResponse.json({ error: 'Token contract not configured' }, { status: 500 })
    }

    // Create clients for Anvil
    const publicClient = createPublicClient({
      transport: http(RPC_URL),
    })

    // Impersonate whale account on Anvil
    await publicClient.request({
      // @ts-expect-error Anvil-specific method
      method: 'anvil_impersonateAccount',
      params: [WHALE_ADDRESS],
    })

    // Create wallet client for impersonated account
    const walletClient = createWalletClient({
      account: WHALE_ADDRESS,
      chain: anvilChain,
      transport: http(RPC_URL),
    })

    // Check whale balance
    const whaleBalance = (await publicClient.readContract({
      address: CONTRACTS.ANON_TOKEN,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [WHALE_ADDRESS],
    })) as bigint

    if (whaleBalance < FAUCET_AMOUNT) {
      return NextResponse.json({ error: 'Faucet whale has insufficient balance' }, { status: 500 })
    }

    // Transfer tokens
    const hash = await walletClient.writeContract({
      address: CONTRACTS.ANON_TOKEN,
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [recipient as `0x${string}`, FAUCET_AMOUNT],
    })

    // Stop impersonating
    await publicClient.request({
      // @ts-expect-error Anvil-specific method
      method: 'anvil_stopImpersonatingAccount',
      params: [WHALE_ADDRESS],
    })

    return NextResponse.json({
      success: true,
      txHash: hash,
      amount: FAUCET_AMOUNT.toString(),
    })
  } catch (error) {
    console.error('Faucet error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Faucet failed' },
      { status: 500 }
    )
  }
}
