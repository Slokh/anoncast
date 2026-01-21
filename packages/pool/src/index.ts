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

// Privacy wallet for managing notes
export {
  PrivacyWallet,
  deriveNote,
  deriveClaimCredentials,
  generateMasterSeed,
  saveWalletState,
  loadWalletState,
  clearWalletState,
  type PrivacyWalletState,
  type NoteState,
  type WalletBalance,
} from './privacy-wallet'
