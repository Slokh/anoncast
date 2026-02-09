// Contract ABIs for interacting with AnonPool and ERC20 tokens

export const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    name: 'symbol',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

export const ANON_POOL_ABI = [
  // Deposit
  {
    name: 'deposit',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'commitment', type: 'bytes32' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  // Withdraw
  {
    name: 'withdraw',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'proof', type: 'bytes' },
      { name: 'nullifierHash', type: 'bytes32' },
      { name: 'root', type: 'bytes32' },
      { name: 'amount', type: 'uint256' },
      { name: 'recipient', type: 'address' },
    ],
    outputs: [],
  },
  // Consolidate - merge multiple notes into one
  {
    name: 'consolidate',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'proofs', type: 'bytes[]' },
      { name: 'nullifierHashes', type: 'bytes32[]' },
      { name: 'merkleRoots', type: 'bytes32[]' },
      { name: 'amounts', type: 'uint256[]' },
      { name: 'newCommitment', type: 'bytes32' },
      { name: 'totalAmount', type: 'uint256' },
    ],
    outputs: [],
  },
  // View functions
  {
    name: 'getPoolStats',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'totalDeposited', type: 'uint256' },
      { name: 'leafCount', type: 'uint32' },
      { name: 'currentRoot', type: 'bytes32' },
      { name: 'treeCapacity', type: 'uint32' },
    ],
  },
  {
    name: 'getLastRoot',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    name: 'isKnownRoot',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'root', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'nullifierSpent',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'getCommitmentData',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'commitment', type: 'bytes32' }],
    outputs: [
      { name: 'exists', type: 'bool' },
      { name: 'leafIndex', type: 'uint32' },
    ],
  },
  {
    name: 'getRootStatus',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'root', type: 'bytes32' }],
    outputs: [
      { name: 'exists', type: 'bool' },
      { name: 'depositsAgo', type: 'uint32' },
      { name: 'depositsUntilExpiry', type: 'uint32' },
    ],
  },
  // Events
  {
    name: 'Deposit',
    type: 'event',
    inputs: [
      { name: 'commitment', type: 'bytes32', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'leafIndex', type: 'uint32', indexed: false },
      { name: 'timestamp', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'Withdrawal',
    type: 'event',
    inputs: [
      { name: 'nullifierHash', type: 'bytes32', indexed: true },
      { name: 'recipient', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    name: 'Consolidation',
    type: 'event',
    inputs: [
      { name: 'nullifierHashes', type: 'bytes32[]', indexed: false },
      { name: 'newCommitment', type: 'bytes32', indexed: true },
      { name: 'totalAmount', type: 'uint256', indexed: false },
      { name: 'leafIndex', type: 'uint32', indexed: false },
    ],
  },
] as const

export const ANON_POOL_GATEWAY_ABI = [
  // depositWithETH - swap ETH to ANON and deposit
  {
    name: 'depositWithETH',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'commitment', type: 'bytes32' },
      { name: 'minAmountOut', type: 'uint256' },
    ],
    outputs: [],
  },
  // depositWithUSDC - swap USDC to ANON and deposit
  {
    name: 'depositWithUSDC',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'commitment', type: 'bytes32' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'minAmountOut', type: 'uint256' },
    ],
    outputs: [],
  },
  // depositExactWithETH - swap exact amount of ETH needed for specific ANON amount
  {
    name: 'depositExactWithETH',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'commitment', type: 'bytes32' },
      { name: 'amountOut', type: 'uint256' },
    ],
    outputs: [],
  },
  // depositExactWithUSDC - swap exact USDC needed for specific ANON amount
  {
    name: 'depositExactWithUSDC',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'commitment', type: 'bytes32' },
      { name: 'amountOut', type: 'uint256' },
      { name: 'maxAmountIn', type: 'uint256' },
    ],
    outputs: [],
  },
  // Events
  {
    name: 'SwapAndDeposit',
    type: 'event',
    inputs: [
      { name: 'sender', type: 'address', indexed: true },
      { name: 'tokenIn', type: 'address', indexed: true },
      { name: 'amountIn', type: 'uint256', indexed: false },
      { name: 'amountOut', type: 'uint256', indexed: false },
      { name: 'commitment', type: 'bytes32', indexed: true },
    ],
  },
] as const
