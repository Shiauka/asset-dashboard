import { promises as fs } from 'fs'
import path from 'path'

const CONFIG_PATH = path.join(process.cwd(), 'db-config.json')

export async function GET() {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf-8')
    return Response.json(JSON.parse(raw))
  } catch {
    return Response.json({ rootDir: null })
  }
}

export async function POST(request: Request) {
  const body = await request.json() as { rootDir: string }
  await fs.writeFile(CONFIG_PATH, JSON.stringify(body, null, 2), 'utf-8')
  return Response.json({ ok: true })
}
