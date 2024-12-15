import { evmStorage } from '../src'
import { concat, createPublicClient, http, keccak256, pad, toHex, toRlp } from 'viem'
import { base } from 'viem/chains'
import { formatArray, formatHexArray } from './utils'

const client = createPublicClient({
  chain: base,
  transport: http(),
})

const blockNumber = BigInt(23675000)
const signature =
  '0x2d37b16631b67cbe79e8b115cda1ee74dde8492beef9fac0746777c463e0c8cc5cfd2cea5f1e2e6d8899e4fe33ab709a449e262cc9fc56c3d63b789d99270954'
const messageHash = '0x9d447d956f18f06efc4e1fa2b715e6a46fe680d3d35e1ebe90b9d56ad1eddca1'
const pubKeyX = '0x1209769585e7ea6b1d48fb8e7a49ad4a687f3f219c802b167132b3456ad8d2e4'
const pubKeyY = '0x733284ca267f3c5e6fa75bade823fdabd5b4b6a91385d1a6ded76cb55d73611c'
const address = '0x8b7467AF8A6AAba2FBD254B043aFefD44195Fa9f'
const tokenAddress = '0x0db510e79909666d6dec7f5e49370838c16d950f'
const balanceSlot = pad(toHex(0))

async function main() {
  const storageKey = keccak256(concat([pad(address), balanceSlot]))
  const proof = await client.getProof({
    address: tokenAddress,
    storageKeys: [storageKey],
    blockNumber: blockNumber,
  })

  const storageProof = proof.storageProof[0]
  const nodes = storageProof.proof.slice(0, storageProof.proof.length - 1)
  const leaf = storageProof.proof[storageProof.proof.length - 1]

  const input = {
    signature: formatHexArray(signature, { length: 64 }),
    message_hash: formatHexArray(messageHash),
    pub_key_x: formatHexArray(pubKeyX),
    pub_key_y: formatHexArray(pubKeyY),
    balance_slot: formatHexArray(balanceSlot),
    value: formatHexArray(toRlp(`0x${storageProof.value.toString(16)}`), {
      pad: 'right',
    }),
    storage_root: formatHexArray(proof.storageHash),
    nodes: formatArray(nodes, (node) =>
      formatHexArray(node, { length: 532, pad: 'right' })
    ),
    leaf: formatHexArray(leaf, { length: 69, pad: 'right' }),
    depth: storageProof.proof.length,
  }

  console.time('generateProof')
  const proofData = await evmStorage.generate(input)
  console.timeEnd('generateProof')
  console.time('verifyProof')
  const verified = await evmStorage.verify(proofData)
  console.timeEnd('verifyProof')
  console.log({ verified })
}

main()
  .catch(console.error)
  .finally(() => process.exit(0))