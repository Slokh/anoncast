import { useState } from 'react'
import { useSDK } from '../providers/sdk'
import { useAccount } from 'wagmi'
import { Credential, PerformAction, PerformActionData } from '@anonworld/sdk/types'
import { parseUnits } from 'viem'

export type ExecuteActionsStatus =
  | {
      status: 'idle' | 'loading' | 'success'
    }
  | {
      status: 'error'
      error: string
    }

export const useExecuteActions = ({
  onSuccess,
  onError,
}: {
  onSuccess?: (
    response: {
      success: boolean
      hash?: string
      tweetId?: string
    }[]
  ) => void
  onError?: (error: string) => void
} = {}) => {
  const { sdk, credentials } = useSDK()
  const [status, setStatus] = useState<ExecuteActionsStatus>({ status: 'idle' })
  const { address } = useAccount()

  const executeActions = async (
    actions: { actionId: string; data: PerformActionData; credential?: Credential }[]
  ) => {
    try {
      if (!address) {
        throw new Error('Not connected')
      }

      setStatus({ status: 'loading' })

      const formattedActions: PerformAction[] = []
      for (const { actionId, data, credential } of actions) {
        const action = await sdk.getAction(actionId)
        if (!action.data) {
          throw new Error('Action not found')
        }

        let requiredCredentialId = action.data.credential_id
        let requiredBalance = action.data.credential_requirement?.minimumBalance
          ? BigInt(action.data.credential_requirement.minimumBalance)
          : parseUnits('5000', 18)

        let credentialToUse = credential
        if (requiredCredentialId) {
          credentialToUse = credentials.credentials.find(
            (c) =>
              c.credential_id === requiredCredentialId &&
              c.metadata?.balance &&
              BigInt(c.metadata.balance) >= requiredBalance
          )
          if (!credentialToUse) {
            const [_, chainId, tokenAddress] = requiredCredentialId.split(':')
            credentialToUse = await credentials.addERC20Balance({
              chainId: Number(chainId),
              tokenAddress: tokenAddress as `0x${string}`,
              verifiedBalance: requiredBalance,
            })
          }
        }

        if (!credentialToUse) {
          continue
        }

        formattedActions.push({
          actionId,
          data,
          credentials: [credentialToUse.id],
        })
      }

      const response = await sdk.executeActions(formattedActions)

      if (!response.data?.results?.[0]?.success) {
        throw new Error('Failed to perform actions')
      }

      setStatus({ status: 'success' })
      onSuccess?.(response.data.results)
    } catch (e) {
      console.error(e)
      setStatus({ status: 'error', error: 'Failed to perform action' })
      onError?.('Failed to perform action')
    }
  }

  return {
    executeActions,
    status,
  }
}
