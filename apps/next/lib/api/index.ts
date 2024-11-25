import type { ProofType, Tree } from '@anon/utils/src/proofs'
import type {
  Cast,
  Channel,
  GetCastsResponse,
  PostCastResponse,
  ValidateFrameResponse,
  UploadImageResponse,
} from '../types'
import { ApiClient } from './client'
import { Identity } from '@anon/api/src/services/types'

const apiClient = new ApiClient(process.env.NEXT_PUBLIC_API_URL || '')

export const api = {
  getNewPosts: async (tokenAddress: string) => {
    const response = await apiClient.request<GetCastsResponse>(
      `/feed/${tokenAddress}/new`
    )
    return response.data
  },
  getTrendingPosts: async (tokenAddress: string) => {
    const response = await apiClient.request<GetCastsResponse>(
      `/feed/${tokenAddress}/trending`
    )
    return response.data
  },
  getMerkleTree: async (tokenAddress: string, proofType: ProofType) => {
    const response = await apiClient.request<Tree>(`/merkle-tree`, {
      method: 'POST',
      body: JSON.stringify({ tokenAddress, proofType }),
    })
    return response.data
  },
  submitAction: async (
    type: ProofType,
    proof: number[],
    publicInputs: string[],
    args: { asReply?: boolean }
  ) => {
    await apiClient.request(`/posts/submit`, {
      method: 'POST',
      body: JSON.stringify({ type, proof, publicInputs, args }),
    })
  },
  createPost: async (proof: number[], publicInputs: string[]) => {
    const response = await apiClient.request<PostCastResponse>(`/posts/create`, {
      method: 'POST',
      body: JSON.stringify({ proof, publicInputs }),
    })
    return response.data
  },
  deletePost: async (proof: number[], publicInputs: string[]) => {
    const response = await apiClient.request<{ success: boolean }>(`/posts/delete`, {
      method: 'POST',
      body: JSON.stringify({ proof, publicInputs }),
    })
    return response.data
  },
  promotePost: async (
    proof: number[],
    publicInputs: string[],
    args: { asReply?: boolean }
  ) => {
    const response = await apiClient.request<
      { success: false } | { success: true; tweetId: string }
    >(`/posts/promote`, {
      method: 'POST',
      body: JSON.stringify({ proof, publicInputs, args }),
    })
    return response.data
  },
  getCast: async (identifier: string) => {
    const response = await apiClient.request<Cast>(`/get-cast?identifier=${identifier}`)
    return response.data
  },
  getChannel: async (identifier: string) => {
    const response = await apiClient.request<Channel>(
      `/get-channel?identifier=${identifier}`
    )
    return response.data
  },
  validateFrame: async (data: string) => {
    const response = await apiClient.request<ValidateFrameResponse>(
      `/validate-frame?data=${data}`
    )
    return response.data
  },
  uploadImage: async (image: File) => {
    const formData = new FormData()
    formData.append('image', image)

    const response = await apiClient.request<UploadImageResponse>('/upload', {
      method: 'POST',
      body: formData,
      isFormData: true,
    })

    return response
  },
  revealPost: async (
    castHash: string,
    message: string,
    revealPhrase: string,
    signature: string,
    address: string,
    tokenAddress: string
  ) => {
    const response = await apiClient.request<{ success: boolean }>(`/posts/reveal`, {
      method: 'POST',
      body: JSON.stringify({
        castHash,
        message,
        revealPhrase,
        signature,
        address,
        tokenAddress,
      }),
    })
    return response.data
  },
  getPost: async (hash: string) => {
    const response = await apiClient.request<Cast>(`/posts/${hash}`)
    return response.data
  },
  getIdentity: async (address: string) => {
    const response = await apiClient.request<Identity>(`/identity?address=${address}`)
    return response.data
  },
}
