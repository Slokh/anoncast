import { api } from '@/lib/api'
import { generateProof, ProofType } from '@anon/utils/src/proofs'
import { useState } from 'react'
import { hashMessage } from 'viem'
import { useAccount, useSignMessage } from 'wagmi'

type DeleteState =
  | {
      status: 'idle' | 'signature' | 'generating' | 'done'
    }
  | {
      status: 'error'
      error: string
    }

interface PostContextProps {
  deletePost: (hash: string) => Promise<void>
  deleteState: DeleteState
}

export const useDeletePost = (tokenAddress: string) => {
  const [deleteState, setDeleteState] = useState<DeleteState>({ status: 'idle' })
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

  const deletePost = async (hash: string) => {
    if (!address) return

    setDeleteState({ status: 'signature' })
    try {
      const timestamp = Math.floor(Date.now() / 1000)
      const signatureData = await getSignature({
        address,
        timestamp,
      })
      if (!signatureData) {
        setDeleteState({ status: 'error', error: 'Failed to get signature' })
        return
      }

      setDeleteState({ status: 'generating' })

      const proof = await generateProof({
        tokenAddress,
        userAddress: address,
        proofType: ProofType.DELETE_POST,
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
        setDeleteState({ status: 'error', error: 'Not allowed to delete' })
        return
      }

      if (process.env.NEXT_PUBLIC_DISABLE_QUEUE) {
        await api.deletePost(Array.from(proof.proof), proof.publicInputs)
      } else {
        await api.submitAction(
          ProofType.DELETE_POST,
          Array.from(proof.proof),
          proof.publicInputs,
          {}
        )
      }

      setDeleteState({ status: 'idle' })
    } catch (e) {
      setDeleteState({ status: 'error', error: 'Failed to delete' })
      console.error(e)
    }
  }

  return {
    deletePost,
    deleteState,
  }
}
