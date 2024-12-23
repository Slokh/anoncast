import { useReadContract } from 'wagmi'
import { erc20Abi, formatUnits } from 'viem'

export function useERC20({
  chainId,
  address,
  amount,
}: {
  chainId: number
  address: `0x${string}`
  amount: bigint
}) {
  const { data: symbol } = useReadContract({
    chainId: Number(chainId),
    address,
    abi: erc20Abi,
    functionName: 'symbol',
  })

  const { data: decimals } = useReadContract({
    chainId: Number(chainId),
    address,
    abi: erc20Abi,
    functionName: 'decimals',
  })

  return {
    symbol: symbol,
    decimals,
    amount: Number.parseFloat(formatUnits(amount, decimals ?? 18)),
  }
}
