import {
  Action,
  ApiResponse,
  Cast,
  Channel,
  Credential,
  User,
  PerformAction,
  RequestConfig,
  UploadImageResponse,
  ConversationCast,
  FungiblePosition,
  Fungible,
} from './types'

export class Api {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  private async handleResponse<T>(response: Response): Promise<ApiResponse<T>> {
    const contentType = response.headers.get('content-type')
    const hasJson = contentType?.includes('application/json')
    const data = hasJson ? await response.json() : null

    if (!response.ok) {
      return {
        error: {
          message:
            data?.message ||
            data?.error ||
            `API error: ${response.status} ${response.statusText}`,
          status: response.status,
        },
      }
    }

    return { data }
  }

  public async request<T>(
    endpoint: string,
    config: RequestConfig & { maxRetries?: number } = {}
  ): Promise<ApiResponse<T>> {
    const { headers = {}, maxRetries = 1, isFormData = false, ...options } = config

    const defaultHeaders: Record<string, string> = {
      Accept: 'application/json',
    }

    if (!isFormData) {
      defaultHeaders['Content-Type'] = 'application/json'
    }

    const finalHeaders = {
      ...defaultHeaders,
      ...headers,
    }

    let attempt = 1
    while (true) {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers: finalHeaders,
      })

      if (!response.ok && attempt < maxRetries) {
        attempt++
        continue
      }

      const result = await this.handleResponse<T>(response)

      return result
    }
  }

  async executeActions(actions: PerformAction[]) {
    return await this.request<{
      results: { success: boolean; hash?: string; tweetId?: string }[]
    }>('/actions/execute', {
      method: 'POST',
      body: JSON.stringify({
        actions,
      }),
      maxRetries: 3,
    })
  }

  async revealPost(args: {
    hash: string
    message: string
    phrase: string
    signature: string
    address: string
  }) {
    return await this.request<{ success: boolean; hash?: string }>('/posts/reveal', {
      method: 'POST',
      body: JSON.stringify(args),
    })
  }

  async getTrendingFeed(fid: number) {
    return await this.request<{ data: Array<Cast> }>(`/feeds/${fid}/trending`)
  }

  async getNewFeed(fid: number) {
    return await this.request<{ data: Array<Cast> }>(`/feeds/${fid}/new`)
  }

  async getPost(hash: string) {
    return await this.request<Cast>(`/posts/${hash}`)
  }

  async getPostConversation(hash: string) {
    return await this.request<{ data: Array<ConversationCast> }>(
      `/posts/${hash}/conversation`
    )
  }

  async getFarcasterCast(identifier: string) {
    return await this.request<Cast>(`/farcaster/casts?identifier=${identifier}`)
  }

  async getFarcasterIdentity(address: string) {
    return await this.request<User>(`/farcaster/identities?address=${address}`)
  }

  async getFarcasterUser(fid: number) {
    return await this.request<User>(`/farcaster/users/${fid}`)
  }

  async getFarcasterChannel(channelId: string) {
    return await this.request<Channel>(`/farcaster/channels/${channelId}`)
  }

  async uploadImage(image: File) {
    const formData = new FormData()
    formData.append('image', image)

    return await this.request<UploadImageResponse>('/upload', {
      method: 'POST',
      body: formData,
      isFormData: true,
    })
  }

  async getAction(actionId: string) {
    return await this.request<Action>(`/actions/${actionId}`)
  }

  async getActions() {
    return await this.request<{ data: Action[] }>('/actions')
  }

  async createCredential({
    proof,
    publicInputs,
  }: {
    proof: number[]
    publicInputs: string[]
  }) {
    return await this.request<Credential>('/credentials', {
      method: 'POST',
      body: JSON.stringify({ proof, publicInputs }),
    })
  }

  async getCredential(id: string) {
    return await this.request<Credential>(`/credentials/${id}`)
  }

  async getWalletFungibles(address: string) {
    return await this.request<{ data: FungiblePosition[] }>(
      `/wallet/${address}/fungibles`
    )
  }

  async getFungible(chainId: number, tokenAddress: string) {
    return await this.request<Fungible>(`/tokens/${chainId}/${tokenAddress}`)
  }

  async getBalanceStorageSlot(chainId: number, tokenAddress: string) {
    return await this.request<{ slot: number }>(
      `/tokens/${chainId}/${tokenAddress}/balance-slot`
    )
  }
}
