import { api } from '@/lib/api'
import { generateProof, ProofType } from '@anon/utils/src/proofs/generate'
import { useState } from 'react'
import { hashMessage } from 'viem'
import { useAccount, useSignMessage } from 'wagmi'

type PromoteState =
  | {
      status: 'idle' | 'signature' | 'generating' | 'done'
    }
  | {
      status: 'error'
      error: string
    }

export const usePromotePost = (tokenAddress: string) => {
  const [promoteState, setPromoteState] = useState<PromoteState>({ status: 'idle' })
  const { address } = useAccount()
  const { signMessageAsync } = useSignMessage()

  const getSignature = async ({
    address,
    timestamp,
  }: {
    address: string
    timestamp: number
  }) => {
    try {
      const message = `${address}:${timestamp}`
      const signature = await signMessageAsync({
        message,
      })
      return { signature, message }
    } catch {
      return
    }
  }

  const promotePost = async (hash: string, asReply?: boolean) => {
    if (!address) return

    setPromoteState({ status: 'signature' })
    try {
      const timestamp = Math.floor(Date.now() / 1000)
      const signatureData = await getSignature({
        address,
        timestamp,
      })
      if (!signatureData) {
        setPromoteState({ status: 'error', error: 'Failed to get signature' })
        return
      }

      setPromoteState({ status: 'generating' })

      const proof = await generateProof({
        tokenAddress,
        userAddress: address,
        proofType: ProofType.PROMOTE_POST,
        signature: {
          timestamp,
          signature: signatureData.signature,
          messageHash: hashMessage(signatureData.message),
        },
        input: {
          hash,
        },
      })
      if (!proof) {
        setPromoteState({ status: 'error', error: 'Not allowed to delete' })
        return
      }

      if (process.env.NEXT_PUBLIC_DISABLE_QUEUE) {
        await api.promotePost(Array.from(proof.proof), proof.publicInputs, { asReply })
      } else {
        await api.submitAction(
          ProofType.PROMOTE_POST,
          Array.from(proof.proof),
          proof.publicInputs,
          { asReply }
        )
      }

      setPromoteState({ status: 'idle' })
    } catch (e) {
      setPromoteState({ status: 'error', error: 'Failed to promote' })
      console.error(e)
    }
  }

  return {
    promotePost,
    promoteState,
  }
}
