import { useEffect, useRef, useState } from 'react'
import * as api from '../api/client'
import { ACTIVE_STATUSES, progressPercent } from '../api/types'
import type { ActiveJob, JobStatusValue, Preview, ScanPair } from '../api/types'
import { usePoll } from '../split/usePoll'
import { albumLeaf } from '../tree/buildTree'
import { formatDuration } from '../waveform/geometry'
import CueSelector from './CueSelector'
import { ErrIcon } from './icons'
import LogPanel from './LogPanel'
import SplitAction from './SplitAction'
import TrackTable from './TrackTable'
import Waveform, { type WaveformVariant } from './Waveform'
import '../styles/album.css'
import '../styles/states.css'

export interface AlbumPanelProps {
  item: ScanPair
  /** Bumped by the owner (on rescan) to refetch the preview; see the preview effect. */
  refreshToken?: number
  /** Reports the running split (or `null`) so the topbar and tree can show it. */
  onActiveJobChange?: (job: ActiveJob | null) => void
  /**
   * Fires once when a job reaches `done`. Deliberately separate from
   * `onActiveJobChange`, whose summary goes `null` on completion *and* on album
   * switch — keying off that would re-scan every time the user clicks an album.
   */
  onJobDone?: () => void
}

interface Breadcrumb {
  parents: string[]
  leaf: string
}

// A restore response is only trusted when it actually looks like a JobStatus — the
// test suite's fetch stubs commonly answer unmatched routes with a bare `{}`, and a
// real backend fed a job id it never enqueued 404s instead of returning this shape.
const KNOWN_STATUSES: ReadonlySet<JobStatusValue> = new Set<JobStatusValue>([
  ...ACTIVE_STATUSES,
  'done',
  'error',
])

function breadcrumb(path: string): Breadcrumb {
  const parts = path.split('/').filter(Boolean)
  return { parents: parts.slice(0, -1), leaf: albumLeaf(path) }
}

export default function AlbumPanel({
  item,
  refreshToken = 0,
  onActiveJobChange,
  onJobDone,
}: AlbumPanelProps) {
  const [cueChoice, setCueChoice] = useState(item.cue_files[0] ?? '')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hoveredTrack, setHoveredTrack] = useState<number | null>(null)
  const [jobRun, setJobRun] = useState<{ id: string; key: string } | null>(null)
  // Mirrors `jobRun` for the restore effect below: that effect's `.then` closes over
  // the `jobRun` from the render that started it (mount, so always `null`), and a slow
  // restore must still see a split the user started in the meantime.
  const jobRunRef = useRef(jobRun)
  jobRunRef.current = jobRun
  const [runToken, setRunToken] = useState(0)
  const [doneToken, setDoneToken] = useState(0)
  const [splitError, setSplitError] = useState<string | null>(null)

  // Derived, not effect-synced: an effect would leave `cueFile` holding the previous
  // album's value for one render, and the preview effect would fire on that mismatched
  // pair — a guaranteed 404 on every album switch. Deriving keeps the user's choice
  // when a rescan's fresh list still contains it and falls back to the first entry
  // otherwise, so we never preview a CUE that no longer exists.
  const cueFile = item.cue_files.includes(cueChoice) ? cueChoice : (item.cue_files[0] ?? '')

  // A job belongs to the album/CUE it was started for. Deriving `jobId` from that
  // key rather than clearing it in an effect means a switched album drops its job
  // *during the same render*, so the panel — and the summary it emits — can never
  // show a phantom split for the album now on screen.
  //
  // NUL is the delimiter because neither a path nor a filename can contain one. It
  // must stay the `\u0000` escape: a raw NUL byte here makes this file binary to
  // `file`, `grep` and every other text tool, and renders as an ordinary space.
  const albumKey = `${item.path}\u0000${cueFile}`
  const jobId = jobRun !== null && jobRun.key === albumKey ? jobRun.id : null

  useEffect(() => {
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
        // Clearing on success as well as on identity change: a refetch that
        // recovers from a failed one must drop the error, or the errbox below
        // (checked before `preview`) masks the panel for the rest of the visit.
        if (!cancelled) {
          setPreview(result)
          setError(null)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [item.path, cueFile, refreshToken, doneToken])

  const poll = usePoll(jobId, runToken)
  // `usePoll` resets in an effect, so its state still holds the dropped job for the
  // one render after `jobId` goes null. React re-renders before paint, so this is
  // belt-and-braces rather than a visible bug — but it keeps `job` and `jobId` from
  // ever disagreeing, which is what the emit effect below reports upward.
  const job = jobId === null ? null : poll.job
  // A fetch failure halts polling on a possibly-stale `splitting`/`tagging` job;
  // treat that as no-longer-active so the UI surfaces the error and offers Retry.
  const active = poll.fetchError === null && job !== null && ACTIVE_STATUSES.has(job.status)
  const jobStatus = job?.status

  const [logOpen, setLogOpen] = useState(false)
  // Tracks whether the user has manually closed/opened the log this run, so the
  // auto-expand effect below does not re-open a panel they just closed on the next
  // poll tick. Reset alongside the run itself, or closing one failed run's log
  // would silently disable auto-expand for every later failure in the session.
  const userToggled = useRef(false)

  useEffect(() => {
    userToggled.current = false
  }, [item.path, cueFile, runToken])

  useEffect(() => {
    if (jobStatus === 'error' && !userToggled.current) setLogOpen(true)
  }, [jobStatus])

  // Held in a ref so the completion effect can key on the status transition alone:
  // a caller that re-creates the callback must not re-fire the signal (and the
  // rescan behind it) while the same job still sits at `done`.
  const onJobDoneRef = useRef(onJobDone)
  onJobDoneRef.current = onJobDone

  // Which run has already been reported, so a *re*-observation of it stays silent.
  // `jobRun` outlives an album switch by design, so returning to a split album
  // restores its `jobId` and `usePoll` re-fetches the same `done` — without this
  // latch that replays the signal, re-scanning the library and refetching the
  // preview on every visit. Keyed on `runToken` too: a split-again re-runs the
  // same deterministic job ID and must be allowed to report its own completion.
  const signalledRun = useRef<string | null>(null)

  // Restores a job across a page reload: job ids are deterministic (`path/cue_file`),
  // so a plain GET can ask the backend whether one is already running or finished for
  // this album/CUE without the user touching Split again.
  useEffect(() => {
    if (!cueFile) return
    let cancelled = false
    const restoreId = `${item.path}/${cueFile}`
    const restoreKey = `${item.path}\u0000${cueFile}`
    api
      .status(restoreId)
      .then((restored) => {
        if (cancelled) return
        // A split started while the restore request was in flight wins — this check
        // must read the ref, not `jobRun`, since the closure above always sees the
        // `null` it captured at mount. Compare keys rather than testing for any
        // job at all: `jobRun` outlives an album switch, so a bare null-check
        // would discard every later album's restore once one split has run.
        if (jobRunRef.current?.key === restoreKey) return
        if (!KNOWN_STATUSES.has(restored.status)) return
        if (!ACTIVE_STATUSES.has(restored.status)) {
          // Pre-arm the latch before `setJobRun` so the completion effect below sees
          // this run as already signalled and does not re-fire `onJobDone` — a click
          // on an already-split album must not trigger a library rescan.
          signalledRun.current = `${runToken}:${restoreId}`
        }
        setJobRun({ id: restoreId, key: restoreKey })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        if (err instanceof api.ApiError && err.status === 404) return
        // Non-fatal: leave the panel in its idle state rather than surfacing a
        // background restore failure as if it were a preview or split error.
      })
    return () => {
      cancelled = true
    }
    // `runToken` is deliberately excluded: this is a one-shot restore per album/CUE,
    // and re-running it on every split (runToken bump) would re-probe a job the panel
    // just created itself. The `runToken` this effect reads inside `.then` is only
    // ever consulted while `jobRunRef.current` is still `null`, i.e. before any split
    // has bumped it — so the value captured at mount remains correct there.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.path, cueFile])

  // A completed job is the one event that writes to `/output` without changing
  // the preview effect's keys — `split_done`/`output_tracks` would stay stale.
  // The same transition is the owner's only cue that `items` moved too: the album
  // just gained its split output, so the topbar counters and the tree's ✓ are now
  // wrong until something re-scans.
  useEffect(() => {
    if (jobStatus !== 'done' || jobId === null) return
    const runKey = `${runToken}:${jobId}`
    if (signalledRun.current === runKey) return
    signalledRun.current = runKey
    setDoneToken((n) => n + 1)
    onJobDoneRef.current?.()
  }, [jobStatus, jobId, runToken])

  const activeStatus = active ? job.status : null
  const progressCurrent = job?.progress_current ?? 0
  const progressTotal = job?.progress_total ?? 0

  useEffect(() => {
    onActiveJobChange?.(
      activeStatus === null
        ? null
        : { path: item.path, status: activeStatus, progressCurrent, progressTotal }
    )
  }, [onActiveJobChange, item.path, activeStatus, progressCurrent, progressTotal])

  // Unmounting (album deselected, scan error, panel replaced) must not leave the
  // topbar claiming a split is still running.
  useEffect(() => {
    return () => onActiveJobChange?.(null)
  }, [onActiveJobChange])

  async function handleSplit() {
    setSplitError(null)
    try {
      const accepted = await api.split(item.path, cueFile)
      // Job IDs are deterministic, so a split-again/retry returns the same ID;
      // bump runToken to force usePoll to restart even when jobId is unchanged.
      setRunToken((n) => n + 1)
      setJobRun({ id: accepted.job_id, key: albumKey })
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
        <div className="errbox">
          <div className="eh">
            <ErrIcon />
            Preview failed
          </div>
          <div className="em">{error}</div>
        </div>
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

  const splitDone = job?.status === 'done' ? true : preview.split_done
  const fetchError = splitError ?? poll.fetchError

  const variant: WaveformVariant = active ? 'active' : splitDone ? 'done' : 'idle'
  const progress = progressPercent(progressCurrent, progressTotal)

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
            <CueSelector cueFiles={item.cue_files} value={cueFile} onChange={setCueChoice} />
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
      <LogPanel
        entries={poll.log}
        label="Split log"
        summary={`${poll.log.length} line${poll.log.length === 1 ? '' : 's'}`}
        open={logOpen}
        onToggle={(next) => {
          userToggled.current = true
          setLogOpen(next)
        }}
      />
    </div>
  )
}
