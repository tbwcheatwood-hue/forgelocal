import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { buildTemplatePlan } from '../src/shared/projectGen'
import { PreviewService } from '../src/main/services/preview'
import { stackSupportsBrowserPreview } from '../src/shared/workspaceLayout'

async function main() {
  const parent = path.join(os.homedir(), 'ForgeLocalProjects')
  await fs.mkdir(parent, { recursive: true })
  const plan = buildTemplatePlan(
    'Build me a new sticky-notes app with HTML CSS and JS',
    'static-web'
  )
  const root = path.join(parent, 'sticky-notes-verify')
  await fs.rm(root, { recursive: true, force: true })
  await fs.mkdir(root, { recursive: true })
  for (const file of plan.files) {
    const abs = path.join(root, file.path)
    await fs.mkdir(path.dirname(abs), { recursive: true })
    await fs.writeFile(abs, file.content, 'utf8')
  }
  console.log('wrote', plan.files.length, 'files to', root)
  console.log('files:', (await fs.readdir(root)).join(', '))
  console.log('browser preview supported:', stackSupportsBrowserPreview(plan.stack))

  const preview = new PreviewService()
  const started = await preview.start(root, '.')
  console.log('preview start:', started)
  if (!started.ok) process.exit(1)
  const res = await fetch(started.url)
  const html = await res.text()
  console.log(
    'HTTP',
    res.status,
    'bytes',
    html.length,
    'has doctype',
    /<!doctype html>/i.test(html)
  )
  await preview.stop()
  console.log('preview stopped ok')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
