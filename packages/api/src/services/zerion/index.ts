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

  async getChains(): Promise<Chain[]> {
    try {
      const response = await this.makeRequest<Chain[]>('/chains')
      return response.data
    } catch (error) {
      throw new Error(
        `Failed to fetch chains: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      )
    }
  }

  async getWalletPortfolio(address: string): Promise<Portfolio> {
    try {
      const response = await this.makeRequest<Portfolio>(
        `/wallets/${address}/portfolio`,
        { maxRetries: 12 }
      )
      return response.data
    } catch (error) {
      throw new Error(
        `Failed to fetch wallet portfolio: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      )
    }
  }

  async getFungiblePositions(address: string): Promise<FungiblePosition[]> {
    const response = await this.makeRequest<FungiblePosition[]>(
      `/wallets/${address}/positions?filter[chain_ids]=${SUPPORTED_CHAIN_IDS.join(',')}`
    )
    return response.data
  }

  async getFungible(id: string): Promise<Fungible> {
    const response = await this.makeRequest<Fungible>(`/fungibles/${id}`)
    return response.data
  }

  async getFungibleChart(id: string, period: ChartPeriod): Promise<Chart> {
    const response = await this.makeRequest<Chart>(`/fungibles/${id}/charts/${period}`)
    return response.data
  }
}

export const zerion = ZerionService.getInstance()
