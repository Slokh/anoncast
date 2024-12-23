import { createElysia } from '../utils'
import { t } from 'elysia'
import { createCredentialInstance, getCredentialInstance } from '@anonworld/db'
import { erc20Balance } from '@anonworld/zk'
import {
  createPublicClient,
  keccak256,
  http,
  zeroAddress,
  pad,
  concat,
  toHex,
} from 'viem'
import { base } from 'viem/chains'

const client = createPublicClient({
  chain: base,
  transport: http(),
})

export const credentialsRoutes = createElysia({ prefix: '/credentials' })
  .post(
    '/',
    async ({ body }) => {
      const verified = await erc20Balance.verify({
        proof: new Uint8Array(body.proof),
        publicInputs: body.publicInputs,
      })
      if (!verified) {
        throw new Error('Invalid proof')
      }
      const metadata = erc20Balance.parseData(body.publicInputs)
      const credentialId = `ERC20_BALANCE:${metadata.chainId}:${metadata.tokenAddress}`
      const id = keccak256(new Uint8Array(body.proof))
      let credential = await getCredentialInstance(id)
      if (!credential) {
        const block = await client.getBlock({ blockNumber: BigInt(metadata.blockNumber) })
        const ethProof = await client.getProof({
          address: metadata.tokenAddress,
          storageKeys: [
            keccak256(concat([pad(zeroAddress), pad(toHex(metadata.balanceSlot))])),
          ],
          blockNumber: BigInt(metadata.blockNumber),
        })

        if (ethProof.storageHash !== metadata.storageHash) {
          throw new Error('Invalid storage hash')
        }

        credential = await createCredentialInstance({
          id,
          credential_id: credentialId,
          metadata,
          proof: body,
          verified_at: new Date(Number(block.timestamp) * 1000),
        })
      }

      return {
        ...credential,
        proof: undefined,
      }
    },
    {
      body: t.Object({
        proof: t.Array(t.Number()),
        publicInputs: t.Array(t.String()),
      }),
    }
  )
  .get('/:id', async ({ params }) => {
    const credential = await getCredentialInstance(params.id)
    return credential
  })
