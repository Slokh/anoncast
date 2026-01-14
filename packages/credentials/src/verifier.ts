import {
  type GetProofReturnType,
  keccak256,
  concat,
  toHex,
  pad,
  createPublicClient,
  http,
} from 'viem'
import { base } from 'viem/chains'
import { formatArray, formatHexArray, getPublicKey } from './utils'
import { Circuit } from './utils/circuit'
import circuit from './circuit/target/anon_balance.json'
import vkey from './circuit/target/vkey.json'

// $ANON token on Base
export const ANON_TOKEN = {
  address: '0x0Db510e79909666d6dEc7f5e49370838c16D950f' as const,
  chainId: 8453,
  balanceSlot: 0, // Standard ERC20 balance slot
  decimals: 18,
}

// Balance thresholds
export const BALANCE_THRESHOLDS = {
  POST: BigInt(5_000) * BigInt(10 ** 18), // 5,000 $ANON
  PROMOTE: BigInt(2_000_000) * BigInt(10 ** 18), // 2,000,000 $ANON
}

export type ProofData = {
  proof: number[]
  publicInputs: string[]
}

export type CredentialData = {
  balance: string
  chainId: number
  blockNumber: string
  tokenAddress: string
  balanceSlot: string
  storageHash: string
}

export type BuildInputResult = {
  input: {
    storageHash: string
    storageProof: GetProofReturnType['storageProof']
    chainId: string
    blockNumber: string
    tokenAddress: string
    balanceSlot: string
    verifiedBalance: string
  }
  message: string
}

export type GenerateProofInput = BuildInputResult['input'] & {
  signature: string
  messageHash: string
}

export class AnonBalanceVerifier extends Circuit {
  private client: ReturnType<typeof createPublicClient>

  constructor() {
    super(circuit, vkey)
    this.client = createPublicClient({
      chain: base,
      transport: http(),
    }) as ReturnType<typeof createPublicClient>
  }

  /**
   * Build the input data needed for proof generation.
   * This fetches the current storage proof from the blockchain.
   *
   * @param address - The wallet address to prove balance for
   * @param verifiedBalance - The balance threshold to prove (e.g., 5000 tokens)
   */
  async buildInput(address: string, verifiedBalance: bigint): Promise<BuildInputResult> {
    const balanceSlotHex = pad(toHex(ANON_TOKEN.balanceSlot))
    const storageKey = keccak256(concat([pad(address as `0x${string}`), balanceSlotHex]))

    const block = await this.client.getBlock()
    const ethProof = await this.client.getProof({
      address: ANON_TOKEN.address,
      storageKeys: [storageKey],
      blockNumber: block.number,
    })

    const input = {
      storageHash: ethProof.storageHash,
      storageProof: ethProof.storageProof,
      chainId: `0x${ANON_TOKEN.chainId.toString(16)}`,
      blockNumber: `0x${block.number.toString(16)}`,
      tokenAddress: ANON_TOKEN.address,
      balanceSlot: balanceSlotHex,
      verifiedBalance: `0x${verifiedBalance.toString(16)}`,
    }

    // Message to sign (excludes storageProof for brevity)
    const message = JSON.stringify({ ...input, storageProof: undefined })

    return { input, message }
  }

  /**
   * Generate a ZK proof of token balance.
   *
   * @param args - Input data including signature and storage proof
   */
  async generateProof(args: GenerateProofInput): Promise<ProofData> {
    const { pubKeyX, pubKeyY } = await getPublicKey(
      args.signature as `0x${string}`,
      args.messageHash as `0x${string}`
    )

    const storageProof = args.storageProof[0]
    const nodes = storageProof.proof.slice(0, storageProof.proof.length - 1)
    const leaf = storageProof.proof[storageProof.proof.length - 1]

    const input = {
      signature: formatHexArray(args.signature, { length: 64 }),
      message_hash: formatHexArray(args.messageHash),
      pub_key_x: formatHexArray(pubKeyX),
      pub_key_y: formatHexArray(pubKeyY),
      storage_hash: formatHexArray(args.storageHash),
      storage_nodes: formatArray(
        nodes,
        (node) => formatHexArray(node, { length: 1080, pad: 'right' }),
        { length: 5 }
      ),
      storage_leaf: formatHexArray(leaf, { length: 120, pad: 'right' }),
      storage_depth: storageProof.proof.length,
      storage_value: `0x${storageProof.value.toString(16)}`,
      chain_id: args.chainId,
      block_number: args.blockNumber,
      token_address: args.tokenAddress,
      balance_slot: args.balanceSlot,
      verified_balance: args.verifiedBalance,
    }

    const proof = await super.generate(input)

    return {
      proof: Array.from(proof.proof),
      publicInputs: proof.publicInputs,
    }
  }

  /**
   * Verify a ZK proof.
   */
  async verifyProof(proof: ProofData): Promise<boolean> {
    return super.verify({
      proof: new Uint8Array(proof.proof),
      publicInputs: proof.publicInputs,
    })
  }

  /**
   * Parse the public inputs from a proof into readable data.
   */
  parseData(publicInputs: string[]): CredentialData {
    const balance = BigInt(publicInputs[0]).toString()
    const chainId = Number(BigInt(publicInputs[1]).toString())
    const blockNumber = BigInt(publicInputs[2]).toString()
    const tokenAddress = `0x${publicInputs[3].slice(-40)}`
    const balanceSlot = BigInt(publicInputs[4]).toString()
    const storageHash = `0x${publicInputs
      .slice(5, 5 + 32)
      .map((b) => BigInt(b).toString(16).padStart(2, '0'))
      .join('')}`

    return {
      balance,
      chainId,
      blockNumber,
      tokenAddress,
      balanceSlot,
      storageHash,
    }
  }

  /**
   * Check if the proven balance meets the POST threshold.
   */
  canPost(balance: bigint): boolean {
    return balance >= BALANCE_THRESHOLDS.POST
  }

  /**
   * Check if the proven balance meets the PROMOTE threshold.
   */
  canPromote(balance: bigint): boolean {
    return balance >= BALANCE_THRESHOLDS.PROMOTE
  }

  /**
   * Get balance tier from proof data.
   */
  getBalanceTier(proofData: ProofData): 'none' | 'post' | 'promote' {
    const data = this.parseData(proofData.publicInputs)
    const balance = BigInt(data.balance)

    if (this.canPromote(balance)) return 'promote'
    if (this.canPost(balance)) return 'post'
    return 'none'
  }
}

// Singleton instance
let verifierInstance: AnonBalanceVerifier | null = null

export function getVerifier(): AnonBalanceVerifier {
  if (!verifierInstance) {
    verifierInstance = new AnonBalanceVerifier()
  }
  return verifierInstance
}
