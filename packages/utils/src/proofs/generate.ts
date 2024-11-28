import { recoverPublicKey } from 'viem'
import { UltraPlonkBackend, ProofData } from '@aztec/bb.js'
import { type Noir } from '@noir-lang/noir_js'
import { chunkHexString, getCircuit, stringToHexArray } from './utils'

export interface Tree {
  elements: {
    address: string
    balance: string
    path: string[]
  }[]
  root: string
}

export enum ProofType {
  CREATE_POST,
  DELETE_POST,
  PROMOTE_POST,
  LAUNCH_POST,
}

interface SignatureArgs {
  timestamp: number
  signature: string
  messageHash: string
}

interface CreatePostArgs {
  text: string | null
  embeds: string[]
  quote: string | null
  channel: string | null
  parent: string | null
  revealHash: string | null
}

interface SubmitHashArgs {
  hash: string
}

interface ProofArgs {
  tokenAddress: string
  userAddress: string
  proofType: ProofType
  signature: SignatureArgs
  input: CreatePostArgs | SubmitHashArgs
}

type ProverModules = {
  Noir: typeof Noir
  UltraPlonkBackend: typeof UltraPlonkBackend
}

let proverPromise: Promise<ProverModules> | null = null

export async function initProver(): Promise<ProverModules> {
  if (!proverPromise) {
    proverPromise = (async () => {
      const [{ Noir }, { UltraPlonkBackend }] = await Promise.all([
        import('@noir-lang/noir_js'),
        import('@aztec/bb.js'),
      ])
      return {
        Noir,
        UltraPlonkBackend,
      }
    })()
  }
  return proverPromise
}

async function getTree(args: {
  tokenAddress: string
  proofType: ProofType
}): Promise<Tree | null> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/merkle-tree`, {
    method: 'POST',
    body: JSON.stringify(args),
    headers: {
      'Content-Type': 'application/json',
    },
  })
  if (res.status !== 200) {
    return null
  }
  return await res.json()
}

export async function generateProof(args: ProofArgs): Promise<ProofData | null> {
  const { UltraPlonkBackend, Noir } = await initProver()
  const tree = await getTree({
    tokenAddress: args.tokenAddress,
    proofType: args.proofType,
  })
  if (!tree) {
    return null
  }

  const circuit = getCircuit(args.proofType)
  const backend = new UltraPlonkBackend(circuit.bytecode)
  const noir = new Noir(circuit)

  const nodeIndex = tree.elements.findIndex(
    (i) => i.address === args.userAddress.toLowerCase()
  )

  const node = tree.elements[nodeIndex]
  if (!node) {
    return null
  }

  const pubKey = await recoverPublicKey({
    signature: args.signature.signature as `0x${string}`,
    hash: args.signature.messageHash as `0x${string}`,
  })

  const pubKeyX = pubKey.slice(4, 68)
  const pubKeyY = pubKey.slice(68)

  const input: Record<string, any> = {
    address: args.userAddress.toLowerCase() as string,
    balance: `0x${BigInt(node.balance).toString(16)}`,
    note_root: tree.root,
    index: nodeIndex,
    note_hash_path: node.path,
    signature: chunkHexString(args.signature.signature.replace('0x', ''), 2).slice(0, 64),
    message_hash: chunkHexString(args.signature.messageHash.replace('0x', ''), 2).slice(
      0,
      32
    ),
    pub_key_x: chunkHexString(pubKeyX.replace('0x', ''), 2).slice(0, 32),
    pub_key_y: chunkHexString(pubKeyY.replace('0x', ''), 2).slice(0, 32),
    token_address: args.tokenAddress.toLowerCase(),
    timestamp: args.signature.timestamp,
  }

  if ('hash' in args.input) {
    input.hash = args.input.hash
  } else {
    input.text = stringToHexArray(args.input.text ?? '', 16)
    input.embed_1 = stringToHexArray(
      args.input.embeds.length > 0 ? args.input.embeds[0] : '',
      16
    )
    input.embed_2 = stringToHexArray(
      args.input.embeds.length > 1 ? args.input.embeds[1] : '',
      16
    )
    input.quote_hash = args.input.quote ?? `0x${BigInt(0).toString(16)}`
    input.channel = stringToHexArray(args.input.channel ?? '', 1)[0]
    input.parent = args.input.parent ?? `0x${BigInt(0).toString(16)}`
    input.reveal_hash = args.input.revealHash
      ? chunkHexString(args.input.revealHash.replace('0x', ''), 32)
      : [`0x${BigInt(0).toString(16)}`, `0x${BigInt(0).toString(16)}`]
  }

  const { witness } = await noir.execute(input)
  return await backend.generateProof(witness)
}
