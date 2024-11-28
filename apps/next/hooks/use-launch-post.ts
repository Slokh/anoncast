import { api } from '@/lib/api'
import { generateProof, ProofType } from '@anon/utils/src/proofs/generate'
import { useState } from 'react'
import { hashMessage } from 'viem'
import { useAccount, useSignMessage } from 'wagmi'

type LaunchState =
  | {
      status: 'idle' | 'signature' | 'generating' | 'done'
    }
  | {
      status: 'error'
      error: string
    }

export const useLaunchPost = (tokenAddress: string) => {
  const [launchState, setLaunchState] = useState<LaunchState>({ status: 'idle' })
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

  const launchPost = async (hash: string, asReply?: boolean) => {
    if (!address) return

    setLaunchState({ status: 'signature' })
    try {
      const timestamp = Math.floor(Date.now() / 1000)
      const signatureData = await getSignature({
        address,
        timestamp,
      })
      if (!signatureData) {
        setLaunchState({ status: 'error', error: 'Failed to get signature' })
        return
      }

      setLaunchState({ status: 'generating' })

      const proof = await generateProof({
        tokenAddress,
        userAddress: address,
        proofType: ProofType.LAUNCH_POST,
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
        setLaunchState({ status: 'error', error: 'Not allowed to launch' })
        return
      }

      if (process.env.NEXT_PUBLIC_DISABLE_QUEUE) {
        await api.launchPost(Array.from(proof.proof), proof.publicInputs)
      } else {
        await api.submitAction(
          ProofType.LAUNCH_POST,
          Array.from(proof.proof),
          proof.publicInputs,
          {}
        )
      }

      setLaunchState({ status: 'idle' })
    } catch (e) {
      setLaunchState({ status: 'error', error: 'Failed to launch' })
      console.error(e)
    }
  }

  return {
    launchPost,
    launchState,
  }
}
