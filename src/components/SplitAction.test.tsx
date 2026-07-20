import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { JobStatus, JobStatusValue } from '../api/types'
import SplitAction from './SplitAction'

function job(status: JobStatusValue, overrides: Partial<JobStatus> = {}): JobStatus {
  return {
    status,
    message: '',
    result_files: [],
    progress_current: 0,
    progress_total: 0,
    progress_detail: '',
    log: [],
    log_next: 0,
    ...overrides,
  }
}

function renderAction(props: Partial<Parameters<typeof SplitAction>[0]> = {}) {
  const onSplit = vi.fn()
  const result = render(
    <SplitAction
      trackCount={4}
      splitDone={false}
      outputTracks={0}
      job={null}
      error={null}
      onSplit={onSplit}
      {...props}
    />
  )
  return { ...result, onSplit }
}

describe('SplitAction while a job is in flight', () => {
  // Every pre-existing test jumped queued → done on the first poll, so the guard
  // that stops a second submission mid-split had never rendered anywhere.
  const activeStatuses: JobStatusValue[] = ['queued', 'splitting', 'tagging']

  it.each(activeStatuses)('disables the button and refuses a click while %s', (status) => {
    const { onSplit } = renderAction({ job: job(status) })

    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
    expect(button).toHaveTextContent('Processing…')
    expect(button.className).toContain('dis')
    expect(screen.getByText('splitting & tagging · do not close')).toBeInTheDocument()

    fireEvent.click(button)
    expect(onSplit).not.toHaveBeenCalled()
  })

  it('swaps the split mark for a spinner while active', () => {
    const { container } = renderAction({ job: job('splitting') })

    expect(container.querySelector('.spin')).not.toBeNull()
    expect(container.querySelector('.pi')).toBeNull()
  })

  it('shows the idle label and fires onSplit when no job is running', () => {
    const { onSplit } = renderAction()

    const button = screen.getByRole('button')
    expect(button).toBeEnabled()
    expect(button).toHaveTextContent('Split 4 tracks')
    expect(screen.getByText('writes 4 tracks to output')).toBeInTheDocument()

    fireEvent.click(button)
    expect(onSplit).toHaveBeenCalledOnce()
  })

  it('treats a stale active status as no longer running once a fetch error arrives', () => {
    // `active` is gated on `error === null` (SplitAction.tsx:25): polling has
    // stopped, so `splitting` is the last thing we heard, not the current truth.
    const { onSplit } = renderAction({ job: job('splitting'), error: 'network down' })

    const button = screen.getByRole('button')
    expect(button).toBeEnabled()
    expect(button).toHaveTextContent('Retry')
    expect(screen.getByText('network down')).toBeInTheDocument()

    fireEvent.click(button)
    expect(onSplit).toHaveBeenCalledOnce()
  })
})

describe('SplitAction terminal states', () => {
  it('renders the failure box and a Retry action when the job errors', () => {
    const { container, onSplit } = renderAction({
      job: job('error', { message: 'shnsplit exited 1' }),
    })

    expect(screen.getByText('Split failed')).toBeInTheDocument()
    expect(screen.getByText('shnsplit exited 1')).toBeInTheDocument()
    expect(container.querySelector('.errbox')).not.toBeNull()
    expect(container.querySelector('.errbox-warn')).toBeNull()

    const button = screen.getByRole('button')
    expect(button).toBeEnabled()
    expect(button).toHaveTextContent('Retry')
    fireEvent.click(button)
    expect(onSplit).toHaveBeenCalledOnce()
  })

  it('prefers the job message over the fetch error when both are present', () => {
    renderAction({ job: job('error', { message: 'bad CUE' }), error: 'network down' })

    expect(screen.getByText('bad CUE')).toBeInTheDocument()
    expect(screen.queryByText('network down')).toBeNull()
  })

  it('lists the result files and offers Split again on done', () => {
    const { onSplit } = renderAction({
      job: job('done', { result_files: ['01 - One.flac', '02 - Two.flac'] }),
    })

    expect(screen.getByText('Split completed successfully')).toBeInTheDocument()
    expect(screen.getByText('01 - One.flac')).toBeInTheDocument()
    expect(screen.getByText('02 - Two.flac')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Split again'))
    expect(onSplit).toHaveBeenCalledOnce()
  })

  it('suppresses the overwrite warning while a job is in flight', () => {
    // The warning is about output on disk from a *previous* run; once this run
    // is under way it is noise, and the button already says Processing….
    renderAction({ splitDone: true, outputTracks: 9, job: job('splitting') })

    expect(screen.queryByText('Output already exists')).toBeNull()
  })
})
