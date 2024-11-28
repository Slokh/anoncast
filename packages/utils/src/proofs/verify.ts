import { UltraPlonkBackend, ProofData } from '@aztec/bb.js'
import { getCircuit } from './utils'
import { ProofType } from './generate'

export async function getProvingBackend(proofType: ProofType) {
  const circuit = getCircuit(proofType)
  const backend = new UltraPlonkBackend(circuit.bytecode)

  await backend.instantiate()

  await backend['api'].acirInitProvingKey(
    backend['acirComposer'],
    backend['acirUncompressedBytecode']
  )

  return backend
}

export async function verifyProof(proofType: ProofType, proof: ProofData) {
  const backend = await getProvingBackend(proofType)
  return await backend.verifyProof(proof)
}
