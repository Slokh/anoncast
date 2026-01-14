// Set HOME to /tmp for serverless environments (Vercel) where Barretenberg needs write access
if (typeof process !== 'undefined' && process.env && process.env.VERCEL) {
  process.env.HOME = '/tmp'
}

export {
  AnonBalanceVerifier,
  getVerifier,
  ANON_TOKEN,
  BALANCE_THRESHOLDS,
  type ProofData,
  type CredentialData,
  type BuildInputResult,
  type GenerateProofInput,
} from './verifier'
