import {
  Chain,
  Portfolio,
  ZerionResponse,
  FungiblePosition,
  Fungible,
  Chart,
  ChartPeriod,
} from './types'

const SUPPORTED_CHAIN_IDS = ['base']

class ZerionService {
  private readonly apiKey: string
  private readonly baseUrl = 'https://api.zerion.io/v1'
  private static instance: ZerionService

  private constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  static getInstance(): ZerionService {
    if (!ZerionService.instance) {
      const apiKey = process.env.ZERION_API_KEY
      if (!apiKey) {
        throw new Error('ZERION_API_KEY environment variable is not set')
      }
      ZerionService.instance = new ZerionService(apiKey)
    }
    return ZerionService.instance
  }

  private async makeRequest<T>(
    endpoint: string,
    options?: {
      maxRetries?: number
      retryDelay?: number
    }
  ): Promise<ZerionResponse<T>> {
    const { maxRetries = 1, retryDelay = 10000 } = options ?? {}
    let retries = 0

    while (retries < maxRetries) {
      const headers: Record<string, string> = {
        accept: 'application/json',
        authorization: `Basic ${this.apiKey}`,
      }
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        headers,
      })

      if (response.status === 202 && maxRetries > 1) {
        retries++
        await new Promise((resolve) => setTimeout(resolve, retryDelay))
        continue
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      return response.json()
    }

    throw new Error('Maximum retries reached while waiting for data')
  }

  async getFungiblePositions(address: string): Promise<FungiblePosition[]> {
    const response = await this.makeRequest<FungiblePosition[]>(
      `/wallets/${address}/positions?filter[chain_ids]=${SUPPORTED_CHAIN_IDS.join(',')}`
    )
    return response.data
  }

  async getFungible(chainId: number, tokenAddress: string): Promise<Fungible> {
    const response = await this.makeRequest<Fungible[]>(
      `/fungibles?filter[implementation_chain_id]=${chainId}&filter[implementation_address]=${tokenAddress}`
    )
    return response.data[0]
  }
}

export const zerion = ZerionService.getInstance()
