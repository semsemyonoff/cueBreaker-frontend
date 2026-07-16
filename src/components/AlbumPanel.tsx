import { useEffect, useState } from 'react'
import * as api from '../api/client'
import { ACTIVE_STATUSES } from '../api/types'
import type { Preview, ScanPair } from '../api/types'
import { usePoll } from '../split/usePoll'
import { formatDuration } from '../waveform/geometry'
import CueSelector from './CueSelector'
import SplitAction from './SplitAction'
import TrackTable from './TrackTable'
import Waveform, { type WaveformVariant } from './Waveform'
import '../styles/album.css'
import '../styles/states.css'

export interface AlbumPanelProps {
  item: ScanPair
  /** Bumped by the owner (on rescan) to refetch the preview; see the preview effect. */
  refreshToken?: number
}

interface Breadcrumb {
  parents: string[]
  leaf: string
}

function breadcrumb(path: string): Breadcrumb {
  const parts = path.split('/').filter(Boolean)
  return { parents: parts.slice(0, -1), leaf: parts[parts.length - 1] ?? path }
}

export default function AlbumPanel({ item, refreshToken = 0 }: AlbumPanelProps) {
  const [cueFile, setCueFile] = useState(item.cue_files[0] ?? '')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hoveredTrack, setHoveredTrack] = useState<number | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [runToken, setRunToken] = useState(0)
  const [doneToken, setDoneToken] = useState(0)
  const [splitError, setSplitError] = useState<string | null>(null)

  // Keep the selection when a rescan hands back a cue list that still contains it
  // (`cue_files` is a fresh array on every scan); fall back to the first entry
  // when the selected CUE is gone, so we never preview a file that no longer exists.
  useEffect(() => {
    setCueFile((current) =>
      item.cue_files.includes(current) ? current : (item.cue_files[0] ?? '')
    )
  }, [item.path, item.cue_files])

  useEffect(() => {
    setJobId(null)
    setSplitError(null)
  }, [item.path, cueFile])

  // Clearing is keyed on identity only: a refetch of the *same* album/CUE should
  // swap the data in place rather than flash the panel back to `Loading…`.
  useEffect(() => {
    setPreview(null)
    setError(null)
  }, [item.path, cueFile])

  // `refreshToken`/`doneToken` cover the changes to disk state that leave both
  // `path` and `cueFile` untouched: a rescan, and a split job finishing.
  useEffect(() => {
    if (!cueFile) return
    let cancelled = false
    api
      .preview(item.path, cueFile)
      .then((result) => {
        if (!cancelled) setPreview(result)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [item.path, cueFile, refreshToken, doneToken])

  const poll = usePoll(jobId, runToken)
  const jobStatus = poll.job?.status

  // A completed job is the one event that writes to `/output` without changing
  // the preview effect's keys — `split_done`/`output_tracks` would stay stale.
  useEffect(() => {
    if (jobStatus === 'done') setDoneToken((n) => n + 1)
  }, [jobStatus])

  async function handleSplit() {
    setSplitError(null)
    try {
      const accepted = await api.split(item.path, cueFile)
      // Job IDs are deterministic, so a split-again/retry returns the same ID;
      // bump runToken to force usePoll to restart even when jobId is unchanged.
      setRunToken((n) => n + 1)
      setJobId(accepted.job_id)
    } catch (err) {
      setSplitError(err instanceof Error ? err.message : String(err))
    }
  }

  const { parents, leaf } = breadcrumb(item.path)
  const crumbs = (
    <div className="crumbs">
      {parents.length > 0 ? `${parents.join(' / ')} / ` : null}
      <b>{leaf}</b>
    </div>
  )

  if (error) {
    return (
      <div className="album">
        {crumbs}
        <p className="album-error">{error}</p>
      </div>
    )
  }

  if (!preview) {
    return (
      <div className="album">
        {crumbs}
        <p className="album-loading">Loading…</p>
      </div>
    )
  }

  const job = poll.job
  // A fetch failure halts polling on a possibly-stale `splitting`/`tagging` job;
  // treat that as no-longer-active so the UI surfaces the error and offers Retry.
  const active = poll.fetchError === null && job !== null && ACTIVE_STATUSES.has(job.status)
  const splitDone = job?.status === 'done' ? true : preview.split_done
  const fetchError = splitError ?? poll.fetchError

  const variant: WaveformVariant = active ? 'active' : splitDone ? 'done' : 'idle'
  const progress =
    job && job.progress_total > 0 ? (job.progress_current / job.progress_total) * 100 : 0

  const waveCaption = active
    ? `SPLITTING · ${job.progress_detail || job.message || 'working…'}`
    : `${splitDone ? 'COMPLETE' : 'WAVEFORM'} · ${preview.tracks.length} cue breakpoints`

  const pillClass = active ? 'pill pill-run' : splitDone ? 'pill pill-done' : 'pill pill-idle'
  const pillLabel = active ? 'Splitting' : splitDone ? 'Split' : 'Unsplit'

  return (
    <div className="album">
      {crumbs}
      <div className="ahead">
        {preview.has_cover ? (
          <img className="cover" src={api.coverUrl(item.path)} alt="" />
        ) : (
          <div className="cover ph">
            <span className="phw">no cover</span>
          </div>
        )}
        <div className="ameta">
          <div className="atitle">{preview.title}</div>
          <div className="aartist">{preview.performer}</div>
          <div className="chips">
            {preview.date && <span className="chip">{preview.date}</span>}
            {preview.genre && <span className="chip">{preview.genre}</span>}
            <span className="chip">
              <b>{preview.tracks.length}</b> tracks
            </span>
          </div>
          <div className="metarow">
            <span className={pillClass}>
              <span className="pdot" />
              {pillLabel}
            </span>
            <CueSelector cueFiles={item.cue_files} value={cueFile} onChange={setCueFile} />
            <span className="srcline">
              <b>source:</b> {preview.file} · {formatDuration(preview.total_seconds)}
            </span>
          </div>
        </div>
      </div>
      <div className="wavewrap">
        <div className="wavecap">
          <span>{waveCaption}</span>
          <span className="cuename">{cueFile}</span>
        </div>
        <Waveform
          variant={variant}
          tracks={preview.tracks}
          totalSeconds={preview.total_seconds}
          progress={progress}
          hoveredTrack={hoveredTrack}
          onHoverTrack={setHoveredTrack}
        />
        {variant === 'idle' && (
          <div className="wtime">
            <span>{formatDuration(0)}</span>
            <span>{formatDuration(preview.total_seconds)}</span>
          </div>
        )}
        {active && job && (
          <div className="statusrow">
            <span className="sl">
              <span className="spin" />
              {job.progress_detail || job.message}
            </span>
            <span className="sr">
              {job.progress_total > 0
                ? `${job.progress_current} / ${job.progress_total} · ${Math.round(progress)}%`
                : job.status}
            </span>
          </div>
        )}
      </div>
      <TrackTable
        tracks={preview.tracks}
        hoveredTrack={hoveredTrack}
        onHoverTrack={setHoveredTrack}
      />
      <SplitAction
        trackCount={preview.tracks.length}
        splitDone={splitDone}
        outputTracks={preview.output_tracks}
        job={job}
        error={fetchError}
        onSplit={handleSplit}
      />
    </div>
  )
}
