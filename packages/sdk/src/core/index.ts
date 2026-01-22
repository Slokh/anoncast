// Transfer circuit and utilities
export {
  TransferVerifier,
  MerkleTree,
  generateNote,
  generateChangeNote,
  generateOutputNote,
  generateOutputCommitment, // Deprecated, use generateOutputNote
  computeCommitment,
  computeNullifierHash,
  hashTwo,
  hashOne,
  serializeNote,
  deserializeNote,
  encodeNote,
  decodeNote,
  prepareTransfer,
  MERKLE_DEPTH,
  type Note,
  type SerializedNote,
  type TransferInput,
  type TransferProofData,
  type ParsedTransferData,
} from './transfer'

// Withdraw circuit and utilities
export {
  WithdrawVerifier,
  addressToBigInt,
  bigIntToAddress,
  type WithdrawProofData,
  type WithdrawInput,
  type ParsedWithdrawData,
} from './withdraw'

// Privacy wallet for managing notes
export {
  PrivacyWallet,
  deriveNote,
  deriveClaimCredentials,
  generateMasterSeed,
  saveWalletState,
  loadWalletState,
  clearWalletState,
  clearAllWalletData,
  type PrivacyWalletState,
  type NoteState,
  type WalletBalance,
} from './privacy-wallet'

// Circuit base class
export { Circuit } from './circuit'

// Shared types
export {
  FRESHNESS_THRESHOLDS,
  getRootFreshnessStatus,
  type RootFreshness,
  type TransferPreparation,
  type WithdrawPreparationData,
} from './types'
