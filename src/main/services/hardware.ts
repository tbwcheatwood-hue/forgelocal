import { execFile } from 'child_process'
import fs from 'fs'
import os from 'os'
import type { HardwareInventory } from '../../shared/companion'

function probe(cmd: string, args: string[], timeoutMs = 2500): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      execFile(cmd, args, { timeout: timeoutMs }, (err, stdout) => {
        if (err) resolve(null)
        else resolve(String(stdout || '').trim() || null)
      })
    } catch {
      resolve(null)
    }
  })
}

function parseMemInfoLinux(): { totalBytes: number | null; availableBytes: number | null } {
  try {
    const text = fs.readFileSync('/proc/meminfo', 'utf8')
    const total = /MemTotal:\s+(\d+)\s kB/.exec(text)
    const avail = /MemAvailable:\s+(\d+)\s kB/.exec(text)
    return {
      totalBytes: total ? Number(total[1]) * 1024 : null,
      availableBytes: avail ? Number(avail[1]) * 1024 : null
    }
  } catch {
    return { totalBytes: null, availableBytes: null }
  }
}

function cpuModel(): string | null {
  try {
    if (process.platform === 'darwin' || process.platform === 'win32') {
      return os.cpus()[0]?.model ?? null
    }
    const text = fs.readFileSync('/proc/cpuinfo', 'utf8')
    const m = /^model name\s*:\s*(.+)$/m.exec(text)
    return m ? m[1].trim() : (os.cpus()[0]?.model ?? null)
  } catch {
    return os.cpus()[0]?.model ?? null
  }
}

async function detectInferenceRuntimes(): Promise<string[]> {
  const found: string[] = []
  const candidates: Array<[string, string]> = [
    ['ollama', 'Ollama'],
    ['llama-server', 'llama.cpp (llama-server)'],
    ['llamafile', 'llamafile'],
    ['ovms', 'OpenVINO Model Server'],
    ['python3', 'Python'],
    ['python', 'Python']
  ]
  for (const [exe, label] of candidates) {
    if (found.includes(label)) continue
    const which = await probe(process.platform === 'win32' ? 'where' : 'which', [exe], 1500)
    if (which) found.push(label)
  }
  return found
}

async function detectGpus(): Promise<HardwareInventory['gpus']> {
  const gpus: HardwareInventory['gpus'] = []
  const smi = await probe(
    'nvidia-smi',
    ['--query-gpu=name,memory.total,driver_version', '--format=csv,noheader,nounits'],
    3000
  )
  if (smi) {
    for (const line of smi.split('\n')) {
      const [name, mem, driver] = line.split(',').map((s) => s.trim())
      if (name) {
        gpus.push({
          kind: 'nvidia',
          name,
          vramBytes: mem ? Number(mem) * 1024 * 1024 : null,
          driver: driver || null
        })
      }
    }
  }
  if (process.platform === 'linux') {
    const lspci = await probe('lspci', [], 3000)
    if (lspci) {
      for (const line of lspci.split('\n')) {
        if (
          !/VGA compatible controller|3D controller|Display controller|Processing accelerator/i.test(
            line
          )
        ) {
          continue
        }
        const name = line.split(':').slice(2).join(':').trim() || null
        const kind = /nvidia/i.test(line)
          ? 'nvidia'
          : /amd|radeon/i.test(line)
            ? 'amd'
            : /intel/i.test(line)
              ? 'intel'
              : 'other'
        if (!gpus.some((g) => g.name === name)) {
          gpus.push({ kind, name, vramBytes: null, driver: null })
        }
      }
    }
  }
  return gpus
}

async function detectNpu(): Promise<HardwareInventory['npu']> {
  if (process.platform !== 'linux') {
    return { detected: false, runtime: null, detail: null }
  }
  const lspci = await probe('lspci', [], 3000)
  const device = lspci?.split('\n').find((l) => /neural|ai boost|npu/i.test(l)) || null
  const ovRuntime = await probe(
    'python3',
    ['-c', 'import openvino.properties.intel_npu as p; print("intel_npu")'],
    4000
  )
  if (device || ovRuntime) {
    return {
      detected: true,
      runtime: ovRuntime ? 'OpenVINO (intel_npu device available)' : null,
      detail: device ? device.split(':').slice(2).join(':').trim() || device : 'intel_npu runtime'
    }
  }
  return { detected: false, runtime: null, detail: null }
}

/** Real measurements only — missing probes yield null/empty, never invented values. */
export async function collectLocalHardware(): Promise<HardwareInventory> {
  const mem =
    process.platform === 'linux'
      ? parseMemInfoLinux()
      : {
          totalBytes: os.totalmem(),
          availableBytes: os.freemem()
        }

  const [gpus, npu, inferenceRuntimes] = await Promise.all([
    detectGpus(),
    detectNpu(),
    detectInferenceRuntimes()
  ])

  return {
    platform: process.platform,
    arch: process.arch,
    hostname: os.hostname(),
    cpuModel: cpuModel(),
    cpuCores: os.cpus().length,
    ramTotalBytes: mem.totalBytes,
    ramAvailableBytes: mem.availableBytes,
    gpus,
    npu,
    inferenceRuntimes,
    measuredAt: Date.now(),
    source: 'local'
  }
}
