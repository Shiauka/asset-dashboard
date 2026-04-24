import { promises as fs } from 'fs'
import path from 'path'

const CONFIG_PATH = path.join(process.cwd(), 'db-config.json')

async function getRootDir(): Promise<string | null> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf-8')
    return (JSON.parse(raw) as { rootDir?: string }).rootDir ?? null
  } catch {
    return null
  }
}

function getTaiwanDate(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' })
}

export async function POST(request: Request) {
  const rootDir = await getRootDir()
  if (!rootDir) {
    return Response.json({ ok: false, error: '尚未設定根目錄' }, { status: 400 })
  }

  try {
    const state: unknown = await request.json()
    const date = getTaiwanDate()
    const filePath = path.join(rootDir, `${date}.json`)

    await fs.mkdir(rootDir, { recursive: true })
    await fs.writeFile(filePath, JSON.stringify(state, null, 2), 'utf-8')

    return Response.json({ ok: true, file: filePath, date })
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
