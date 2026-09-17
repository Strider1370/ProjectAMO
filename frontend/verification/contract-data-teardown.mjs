import fs from 'node:fs/promises'

export default async function teardownContractData() {
  if (process.env.CONTRACT_DATA_PATH_OWNED !== '1') return
  const dataPath = process.env.DATA_PATH
  if (!dataPath) return
  await fs.rm(dataPath, { recursive: true, force: true })
}
