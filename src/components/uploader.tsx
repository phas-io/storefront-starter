'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

const POLL_INTERVAL_MS = 1000
/** The API keeps the analysis status for 12 minutes after the upload. */
const POLL_LIMIT_MS = 12 * 60 * 1000

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** Uploads part files through this storefront's server, then waits for the analysis. */
export function Uploader({ maximumMegabytes }: { maximumMegabytes: number }) {
  const router = useRouter()
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function uploadOne(file: File) {
    if (file.size > maximumMegabytes * 1024 * 1024) throw new Error(`${file.name} is larger than ${maximumMegabytes} MB.`)

    setMessage(`Uploading ${file.name}…`)
    const body = new FormData()
    body.append('file', file)
    const upload = await fetch('/api/parts', { method: 'POST', body })
    if (!upload.ok) throw new Error((await upload.json().catch(() => null))?.message ?? 'The upload failed.')
    const { analysisId } = (await upload.json()) as { analysisId: string }

    setMessage(`Analysing ${file.name}…`)
    const started = Date.now()
    while (Date.now() - started < POLL_LIMIT_MS) {
      await wait(POLL_INTERVAL_MS)
      const poll = await fetch(`/api/parts/${analysisId}`)
      const { status } = (await poll.json()) as { status: 'pending' | 'ready' | 'failed' }
      if (status === 'ready') return
      if (status === 'failed') throw new Error(`The analysis of ${file.name} failed.`)
    }
    throw new Error(`The analysis of ${file.name} took too long.`)
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return
    setBusy(true)
    try {
      for (const file of Array.from(files)) await uploadOne(file)
      setMessage(null)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The upload failed.')
    } finally {
      setBusy(false)
      router.refresh()
    }
  }

  return (
    <div className="card">
      <label>
        Add part files (STL, STEP, IGES, 3MF)
        <input
          type="file"
          multiple
          disabled={busy}
          accept=".stl,.step,.stp,.iges,.igs,.3mf,.x_t,.sldprt"
          onChange={event => {
            void onFiles(event.target.files)
            event.target.value = ''
          }}
        />
      </label>
      {message && <p className="muted">{message}</p>}
    </div>
  )
}
