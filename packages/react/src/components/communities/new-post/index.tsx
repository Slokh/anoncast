import { ActionType, Community } from '@anonworld/common'
import { useActions } from '../../../hooks/use-actions'
import { useCredentials } from '../../../providers'
import { getUsableCredential } from '../../../utils'
import { NewPostProvider } from '../../posts/new/context'
import { NewPostDialog } from '../../posts/new/dialog'
import { NewPostButton } from '../../posts/new'
import { NewCredential } from '../../credentials'
import { formatUnits } from 'viem'

export function NewPost() {
  return (
    <NewPostProvider>
      <NewPostDialog>
        <NewPostButton />
      </NewPostDialog>
    </NewPostProvider>
  )
}

export function NewCommunityPost({
  community,
}: {
  community: Community
}) {
  const { data: actions } = useActions()
  const { credentials } = useCredentials()
  const relevantAction = actions?.find((action) => {
    if (
      action.type === ActionType.COPY_POST_FARCASTER &&
      action.metadata.fid === community.fid
    ) {
      return action
    }

    return null
  })

  const credential = relevantAction
    ? getUsableCredential(credentials, relevantAction)
    : null

  if (!actions) return null

  if (!credential) {
    let minimumBalance: number | undefined = undefined
    for (const action of actions) {
      if (
        !action.credential_requirement ||
        !action.community ||
        action.community.id !== community.id
      )
        continue
      const balance = action.credential_requirement.minimumBalance
      const value = Number.parseFloat(
        formatUnits(BigInt(balance), community.token.decimals)
      )
      if (!minimumBalance || value < minimumBalance) {
        minimumBalance = value
      }
    }

    return (
      <NewCredential
        initialTokenId={{
          chainId: community.token.chain_id,
          address: community.token.address,
        }}
        initialBalance={minimumBalance ?? 0}
      />
    )
  }

  return (
    <NewPostProvider initialCredentials={credential ? [credential] : undefined}>
      <NewPostDialog>
        <NewPostButton />
      </NewPostDialog>
    </NewPostProvider>
  )
}
