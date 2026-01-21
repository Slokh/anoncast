import type { CompiledCircuit, Noir } from '@noir-lang/noir_js'
import type { UltraHonkBackend, BarretenbergVerifier, ProofData } from '@aztec/bb.js'

type ProverModules = {
  Noir: typeof Noir
  UltraHonkBackend: typeof UltraHonkBackend
}

type VerifierModules = {
  BarretenbergVerifier: typeof BarretenbergVerifier
}

export abstract class Circuit {
  private proverPromise: Promise<ProverModules> | null = null
  private verifierPromise: Promise<VerifierModules> | null = null

  private circuit: CompiledCircuit
  private vkey: Uint8Array

  constructor(circuit: unknown, vkey: unknown) {
    this.circuit = circuit as CompiledCircuit
    // Convert vkey from JSON array to Uint8Array if needed
    this.vkey = Array.isArray(vkey) ? new Uint8Array(vkey) : (vkey as Uint8Array)
  }

  async initProver(): Promise<ProverModules> {
    if (!this.proverPromise) {
      this.proverPromise = (async () => {
        const [{ Noir }, { UltraHonkBackend }] = await Promise.all([
          import('@noir-lang/noir_js'),
          import('@aztec/bb.js'),
        ])
        return {
          Noir,
          UltraHonkBackend,
        }
      })()
    }
    return this.proverPromise
  }

  async initVerifier(): Promise<VerifierModules> {
    if (!this.verifierPromise) {
      this.verifierPromise = (async () => {
        const { BarretenbergVerifier } = await import('@aztec/bb.js')
        return { BarretenbergVerifier }
      })()
    }
    return this.verifierPromise
  }

  async verify(proofData: ProofData) {
    const { BarretenbergVerifier } = await this.initVerifier()

    const verifier = new BarretenbergVerifier({ crsPath: process.env.TEMP_DIR })
    const result = await verifier.verifyUltraHonkProof(proofData, this.vkey)

    return result
  }

  /**
   * Generate a proof using bb.js
   * @param input - Circuit inputs
   * @param options - Optional settings { keccak: boolean } - use keccak for EVM-compatible proofs
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async generate(input: any, options?: { keccak?: boolean }) {
    const { Noir, UltraHonkBackend } = await this.initProver()

    const backend = new UltraHonkBackend(this.circuit.bytecode)
    const noir = new Noir(this.circuit)

    const { witness } = await noir.execute(input)

    // bb.js 0.82.2 supports keccak option for EVM-compatible proofs
    return await backend.generateProof(witness, options)
  }

  abstract parseData(publicInputs: string[]): unknown
}
