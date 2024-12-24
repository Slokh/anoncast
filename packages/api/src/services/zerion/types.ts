export interface ZerionResponse<T> {
  data: T
  links?: {
    first: string
    last: string
    next?: string
    prev?: string
  }
}

interface Relationships {
  chain: {
    links: {
      related: string
    }
    data: {
      type: string
      id: string
    }
  }
  fungible: {
    links: {
      related: string
    }
    data: {
      type: string
      id: string
    }
  }
}

interface Base<T> {
  type: string
  id: string
  attributes: T
  relationships: Relationships
}

interface PortfolioAttributes {
  positions_distribution_by_type: {
    wallet: number
    deposited: number
    borrowed: number
    locked: number
    staked: number
  }
  positions_distribution_by_chain: {
    [key: string]: number
  }
  total: {
    positions: number
  }
  changes: {
    absolute_1d: number
    percent_1d: number
  }
}

interface ChainAttributes {
  name: string
  description?: string
  native_token_address: string
  icon_url?: string
}

interface FungiblePositionAttributes {
  parent: null
  protocol: null
  name: string
  position_type: string
  quantity: {
    int: string
    decimals: number
    float: number
    numeric: string
  }
  value: number | null
  price: number
  changes: {
    absolute_1d: number | null
    percent_1d: number | null
  } | null
  fungible_info: {
    name: string
    symbol: string
    icon: {
      url: string
    } | null
    flags: {
      verified: boolean
    }
    implementations: {
      chain_id: string
      address: string | null
      decimals: number
    }[]
  }
  flags: {
    displayable: boolean
    is_trash: boolean
  }
  updated_at: string
  updated_at_block: number
}

export type FungibleAttributes = {
  name: string
  symbol: string
  description: string
  icon: {
    url: string
  }
  flags: {
    verified: boolean
  }
  external_links: Array<{
    type: string
    name: string
    url: string
  }>
  implementations: Array<{
    chain_id: string
    address: string
    decimals: number
  }>
  market_data: {
    total_supply: number
    circulating_supply: number
    market_cap: number
    fully_diluted_valuation: number
    price: number
    changes: {
      percent_1d: number
      percent_30d: number
      percent_90d: number
      percent_365d: any
    }
  }
}

export type ChartAttributes = {
  begin_at: string
  end_at: string
  stats: {
    first: number
    min: number
    avg: number
    max: number
    last: number
  }
  points: Array<Array<number>>
}

export type ChartPeriod = 'hour' | 'day' | 'week' | 'month' | 'year' | 'max'

export type Chain = Base<ChainAttributes>
export type Portfolio = Base<PortfolioAttributes>
export type FungiblePosition = Base<FungiblePositionAttributes>
export type Fungible = Base<FungibleAttributes>
export type Chart = Base<ChartAttributes>
