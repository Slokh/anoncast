import { recoverPublicKey } from 'viem'

export async function getPublicKey(signature: `0x${string}`, messageHash: `0x${string}`) {
  const pubKey = await recoverPublicKey({
    hash: messageHash,
    signature,
  })
  const pubKeyX = pubKey.slice(4, 68)
  const pubKeyY = pubKey.slice(68)

  return { pubKeyX, pubKeyY }
}

export function formatArray(
  arr: string[],
  formatFn: (item: string) => string[],
  { length = 7, pad = 'end' }: { length?: number; pad?: 'start' | 'end' } = {}
) {
  const result: string[][] = []
  for (const item of arr) {
    result.push(formatFn(item))
  }

  while (result.length < length) {
    if (pad === 'start') {
      result.unshift(formatFn('0x00'))
    } else {
      result.push(formatFn('0x00'))
    }
  }

  return result
}

export function formatHexArray(
  hex: string,
  {
    chunkSize = 2,
    length = 32,
    pad = 'left',
  }: { chunkSize?: number; length?: number; pad?: 'left' | 'right' } = {}
) {
  const str = hex.replace('0x', '')

  const arr: string[] = []
  for (let i = 0; i < str.length; i += chunkSize) {
    arr.push(`0x${str.slice(i, i + chunkSize)}`)
  }

  while (arr.length < length) {
    if (pad === 'left') {
      arr.unshift('0x00')
    } else {
      arr.push('0x00')
    }
  }

  return arr.slice(0, length)
}
