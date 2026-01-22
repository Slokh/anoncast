import { NextRequest, NextResponse } from 'next/server'
import {
  getCurrentSlotId,
  submitBid,
  isNullifierUsed,
  getCurrentHighestBidAmount,
} from '@/lib/auction-store'

// TODO: Import auction verifier once circuit is compiled
// import { AuctionVerifier } from '@anon/sdk/core/auction'

type BidRequest = {
  content: string
  images?: string[]
  embeds?: string[]
  bidAmount: string
  proof: {
    proof: number[]
    publicInputs: string[]
  }
  claimCommitment: string
}

export async function POST(request: NextRequest) {
  try {
    const body: BidRequest = await request.json()

    // Validate required fields
    if (!body.content || !body.bidAmount || !body.proof || !body.claimCommitment) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    if (body.content.length > 320) {
      return NextResponse.json(
        { error: 'Content exceeds maximum length of 320 characters' },
        { status: 400 }
      )
    }

    // Parse public inputs from proof
    // publicInputs[0] = nullifierHash
    // publicInputs[1] = merkleRoot
    // publicInputs[2] = bidAmount
    // publicInputs[3] = claimCommitment
    const nullifierHash = body.proof.publicInputs[0]
    const proofBidAmount = body.proof.publicInputs[2]

    // Verify bid amount matches proof
    if (BigInt(proofBidAmount) !== BigInt(body.bidAmount)) {
      return NextResponse.json(
        { error: 'Bid amount does not match proof' },
        { status: 400 }
      )
    }

    // Check if nullifier already used
    if (isNullifierUsed(nullifierHash)) {
      return NextResponse.json(
        { error: 'This deposit has already been spent' },
        { status: 400 }
      )
    }

    // TODO: Verify ZK proof once circuit is compiled
    // const verifier = new AuctionVerifier(circuit, vkey)
    // const isValid = await verifier.verifyBidProof(body.proof)
    // if (!isValid) {
    //   return NextResponse.json({ error: 'Invalid proof' }, { status: 401 })
    // }

    // TODO: Verify merkle root is valid (check against contract)

    const slotId = getCurrentSlotId()
    const currentHighest = getCurrentHighestBidAmount(slotId)

    // Check if bid is higher than current highest
    if (BigInt(body.bidAmount) <= BigInt(currentHighest)) {
      return NextResponse.json(
        {
          error: `Bid must be higher than current highest: ${currentHighest}`,
          currentHighest,
        },
        { status: 400 }
      )
    }

    // Submit the bid
    const bid = submitBid({
      slotId,
      bidAmount: body.bidAmount,
      content: body.content,
      images: body.images,
      embeds: body.embeds,
      proof: body.proof,
      nullifierHash,
      claimCommitment: body.claimCommitment,
    })

    return NextResponse.json({
      success: true,
      bidId: bid.id,
      slotId,
      bidAmount: body.bidAmount,
      isHighestBid: true,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
