import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Alert, Box, CircularProgress, Snackbar } from '@mui/material'
import { keepPreviousData, useQueryClient } from '@tanstack/react-query'
import PageHeader from '../../../components/PageHeader'
import ConfirmDialog from '../../../components/ConfirmDialog'
import SortableLists, { type ContainerSlot } from '../../../components/dnd/SortableLists'
import { containerOf, type ListContainer, type Move } from '../../../components/dnd/moveModel'
import { useOptimisticLists } from '../../../components/dnd/useOptimisticLists'
import { useApiQuery } from '../../../hooks/useApiQuery'
import useAuth from '../../../hooks/useAuth'
import api from '../../../lib/api'
import { addDaysKey } from '../../../lib/datetime'
import {
  FUTURE,
  UNFINISHED,
  cardShown,
  coloradoToday,
  dayCount,
  formatTaskDay,
  rangeError,
  readHideCompleted,
  readSpan,
  spanEnd,
  taskError,
  writeHideCompleted,
  writeSpan,
  type Span,
  type TaskFilter,
} from '../../../lib/breweryTasks'
import type { CompletedDisplay, RosterEntry, TaskBoardData, TaskCardData } from '../../../lib/types'
import BoardToolbar from './BoardToolbar'
import ChangeDayDialog from './ChangeDayDialog'
import DayColumn from './DayColumn'
import FinishElsewhereDialog from './FinishElsewhereDialog'
import FutureList from './FutureList'
import TaskCard from './TaskCard'
import TaskDialog, { type TaskDialogMode } from './TaskDialog'
import TaskMenu, { type TaskAction } from './TaskMenu'
import UnfinishedCard from './UnfinishedCard'

const BOARD_KEY = 'brewery-tasks'
const WIDE_BOARD_PX = 1200

/**
 * D38: Brewery → Tasks. The days in the range (in rows of seven), each with
 * its schedule header, Daily card and tasks; the Unfinished card first and
 * the Future list last. Every list is one container in a single
 * SortableLists, so a drag between any two of them is one move.
 */
export default function TaskBoard() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const [span, setSpan] = useState<Span>(readSpan)
  const [hideCompleted, setHideCompleted] = useState(readHideCompleted)
  const [filter, setFilter] = useState<TaskFilter>('all')
  // Nine columns (Unfinished, seven days, Future) need about 1,200px of board,
  // which a 1280px screen beside the nav doesn't have (spec §3.8).
  const [boardEl, setBoardEl] = useState<HTMLElement | null>(null)
  const [boardWidth, setBoardWidth] = useState(0)
  useEffect(() => {
    if (!boardEl) return
    const observer = new ResizeObserver(([entry]) => setBoardWidth(entry.contentRect.width))
    observer.observe(boardEl)
    return () => observer.disconnect()
  }, [boardEl])
  const wide = boardWidth >= WIDE_BOARD_PX

  // The range lives in the URL; without a valid one it's today plus the default span.
  const urlFrom = params.get('from') ?? ''
  const urlTo = params.get('to') ?? ''
  const urlValid = rangeError(urlFrom, urlTo) === null
  const from = urlValid ? urlFrom : coloradoToday()
  const to = urlValid ? urlTo : spanEnd(from, span)
  const length = dayCount(from, to)
  const highlighted: Span | null = urlValid ? (length === 7 || length === 14 ? length : null) : span

  const { data: board, isLoading, isError, error } = useApiQuery<TaskBoardData>(
    [BOARD_KEY, from, to],
    '/api/brewery/tasks',
    { from, to },
    { refetchInterval: 60_000, refetchOnWindowFocus: true, placeholderData: keepPreviousData },
  )
  const { data: roster = [] } = useApiQuery<RosterEntry[]>(['roster'], '/api/roster')
  const brewers = useMemo(() => roster.filter((r) => r.departments.includes('brewery')), [roster])
  const today = board?.today ?? coloradoToday()

  // Every card by key, and the lists as the filter shows them.
  const { cards, source } = useMemo(() => {
    const cards = new Map<string, TaskCardData>()
    const source: ListContainer[] = []
    if (!board) return { cards, source }
    const list = (id: string, items: TaskCardData[]) => {
      items.forEach((c) => cards.set(c.key, c))
      source.push({ id, itemIds: items.filter((c) => cardShown(c, filter, hideCompleted, user?.id)).map((c) => c.key) })
    }
    list(UNFINISHED, board.unfinished)
    board.days.forEach((d) => list(d.date, d.cards))
    list(FUTURE, board.future)
    return { cards, source }
  }, [board, filter, hideCompleted, user?.id])

  const isLocked = useCallback((key: string) => cards.get(key)?.locked ?? false, [cards])
  const { containers, move } = useOptimisticLists(source, isLocked)

  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null)
  const [menu, setMenu] = useState<{ key: string; anchor: HTMLElement } | null>(null)
  const [dialog, setDialog] = useState<{ mode: TaskDialogMode; n: number } | null>(null)
  const [finishing, setFinishing] = useState<TaskCardData | null>(null)
  const [reopening, setReopening] = useState<TaskCardData | null>(null)
  const [changingDay, setChangingDay] = useState<TaskCardData | null>(null)
  const [deleting, setDeleting] = useState<TaskCardData | null>(null)
  const [movingAll, setMovingAll] = useState(false)
  const [busy, setBusy] = useState(false)

  const refresh = () => qc.invalidateQueries({ queryKey: [BOARD_KEY] })
  const fail = (err: unknown) => setToast({ message: taskError(err), error: true })

  /** A write with an optional optimistic change to the cached board, rolled back on failure. */
  const run = async (write: () => Promise<unknown>, optimistic?: (b: TaskBoardData) => TaskBoardData) => {
    const queryKey = [BOARD_KEY, from, to]
    const before = qc.getQueryData<TaskBoardData>(queryKey)
    if (before && optimistic) qc.setQueryData(queryKey, optimistic(before))
    try {
      await write()
      return true
    } catch (err) {
      if (before && optimistic) qc.setQueryData(queryKey, before)
      fail(err)
      return false
    } finally {
      refresh()
    }
  }

  // ── Moves ──────────────────────────────────────────────────────────

  /** Server body for a list move: the day (null = Future) and the task to go before. */
  const moveTask = (m: Move) => {
    const card = cards.get(m.itemId)
    if (!card || m.toContainer === UNFINISHED) return
    const dueOn = m.toContainer === FUTURE ? null : m.toContainer
    if (card.done && dueOn === null) {
      setToast({ message: 'Mark it not done first to move it to Future', error: true })
      return
    }
    const before = m.beforeId ? cards.get(m.beforeId) : null
    const beforeId = before && before.id !== card.id ? before.id : null
    move(m, () => api.post(`/api/brewery/tasks/${card.id}/move`, { due_on: dueOn, before_id: beforeId }))
      .catch(fail)
      .finally(refresh)
  }

  /** The cards in a list that are planned there (not the ones finished there from elsewhere). */
  const ownKeys = (containerId: string) => {
    const list = containers.find((c) => c.id === containerId)
    if (!list || containerId === UNFINISHED) return []
    const day = containerId === FUTURE ? null : containerId
    return list.itemIds.filter((k) => cards.get(k)?.due_on === day)
  }

  const moveStep = (card: TaskCardData, containerId: string, direction: 'up' | 'down') => {
    const own = ownKeys(containerId)
    const i = own.indexOf(card.key)
    const ids = containers.find((c) => c.id === containerId)!.itemIds
    const beforeId =
      direction === 'up' ? own[i - 1] : (ids[ids.indexOf(own[i + 1]) + 1] ?? null)
    moveTask({ itemId: card.key, fromContainer: containerId, toContainer: containerId, beforeId })
  }

  const changeDay = (card: TaskCardData, dueOn: string | null) => {
    setChangingDay(null)
    const fromContainer = containerOf(containers, card.key)
    const target = dueOn ?? FUTURE
    if (fromContainer && containers.some((c) => c.id === target)) {
      moveTask({ itemId: card.key, fromContainer, toContainer: target, beforeId: null })
      return
    }
    // Out of the range: nothing to show it moving to.
    run(() => api.post(`/api/brewery/tasks/${card.id}/move`, { due_on: dueOn, before_id: null })).then(
      (ok) => ok && setToast({ message: `Moved "${card.title}" to ${dueOn ? formatTaskDay(dueOn) : 'Future'}` }),
    )
  }

  // ── Completing ─────────────────────────────────────────────────────

  const setDone = (taskId: number, done: boolean) => (b: TaskBoardData): TaskBoardData => {
    const patch = (c: TaskCardData) => (c.id === taskId ? { ...c, done, completed_by_name: done ? (user?.name ?? null) : null } : c)
    return {
      ...b,
      unfinished: b.unfinished.map(patch),
      future: b.future.map(patch),
      days: b.days.map((d) => ({ ...d, cards: d.cards.map(patch) })),
    }
  }

  const complete = (card: TaskCardData, display?: CompletedDisplay) =>
    run(() => api.post(`/api/brewery/tasks/${card.id}/complete`, display ? { display } : {}), setDone(card.id, true))

  const uncomplete = (card: TaskCardData) =>
    run(() => api.post(`/api/brewery/tasks/${card.id}/uncomplete`), setDone(card.id, false))

  const toggle = (card: TaskCardData) => {
    if (card.done) {
      // Shown on the day it was finished: reopening moves it back, so ask (§3.8).
      const elsewhere = card.due_on !== null && card.completed_display !== 'planned_day' && card.completed_on !== card.due_on
      if (elsewhere) setReopening(card)
      else uncomplete(card)
    } else if (card.due_on === null || card.due_on === today) {
      complete(card)
    } else {
      setFinishing(card)
    }
  }

  // ── Menu ───────────────────────────────────────────────────────────

  const menuCard = menu ? cards.get(menu.key) : undefined
  const menuContainer = menu ? containerOf(containers, menu.key) : null
  const menuOwn = menuContainer ? ownKeys(menuContainer) : []

  const onAction = (action: TaskAction) => {
    if (!menuCard) return
    switch (action) {
      case 'edit':
      case 'notes':
        return setDialog({ mode: { kind: 'edit', card: menuCard, focusNotes: action === 'notes' }, n: Date.now() })
      case 'toggle':
        return toggle(menuCard)
      case 'change-day':
        return setChangingDay(menuCard)
      case 'up':
      case 'down':
        return menuContainer && moveStep(menuCard, menuContainer, action)
      case 'delete':
        return setDeleting(menuCard)
    }
  }

  const deleteTask = async (card: TaskCardData) => {
    setBusy(true)
    const ok = await run(() => api.delete(`/api/brewery/tasks/${card.id}`))
    setBusy(false)
    if (ok) {
      setDeleting(null)
      setDialog(null)
      setToast({ message: `Deleted "${card.title}"` })
    }
  }

  const moveAllToToday = async () => {
    setBusy(true)
    let moved = 0
    const ok = await run(async () => {
      const res = await api.post<{ moved: number }>('/api/brewery/tasks/move_overdue_to_today')
      moved = res.data.moved
    })
    setBusy(false)
    setMovingAll(false)
    if (ok) setToast({ message: `Moved ${moved} ${moved === 1 ? 'task' : 'tasks'} to today` })
  }

  // ── Range ──────────────────────────────────────────────────────────

  const showRange = (f: string, t: string) => setParams({ from: f, to: t })
  const pickSpan = (s: Span) => {
    writeSpan(s)
    setSpan(s)
    showRange(from, spanEnd(from, s))
  }
  const toggleHide = (on: boolean) => {
    writeHideCompleted(on)
    setHideCompleted(on)
  }

  // ── Render ─────────────────────────────────────────────────────────

  const openCount = (id: string) =>
    (containers.find((c) => c.id === id)?.itemIds ?? []).filter((k) => {
      const c = cards.get(k)
      return c && !c.done
    }).length

  const renderContainer = (container: ListContainer, slot: ContainerSlot): ReactNode => {
    if (container.id === UNFINISHED)
      return <UnfinishedCard total={board?.unfinished.length ?? 0} slot={slot} onMoveAll={() => setMovingAll(true)} />
    if (container.id === FUTURE)
      return (
        <FutureList
          openCount={openCount(FUTURE)}
          empty={container.itemIds.length === 0}
          slot={slot}
          onAdd={() => setDialog({ mode: { kind: 'add', dueOn: null }, n: Date.now() })}
        />
      )
    const day = board!.days.find((d) => d.date === container.id)!
    return (
      <DayColumn
        day={day}
        today={today}
        openCount={openCount(day.date)}
        slot={slot}
        onAdd={(date) => setDialog({ mode: { kind: 'add', dueOn: date }, n: Date.now() })}
      />
    )
  }

  const layout = (lists: Record<string, ReactNode>) => {
    if (!board) return null
    const showUnfinished = board.unfinished.length > 0
    const rows = Math.ceil(board.days.length / 7)
    const lead = showUnfinished && wide ? 1 : 0
    const days = board.days.map((d, i) => (
      <Box key={d.date} sx={{ gridColumn: lead + (i % 7) + 1, gridRow: Math.floor(i / 7) + 1, minWidth: 0 }}>
        {lists[d.date]}
      </Box>
    ))
    if (wide) {
      // Unfinished first and Future last, as side columns spanning every row.
      return (
        <Box
          data-testid="board-grid"
          data-layout="wide"
          sx={{
            display: 'grid',
            gap: 1,
            alignItems: 'start',
            gridTemplateColumns: `${showUnfinished ? 'minmax(150px, 1fr) ' : ''}repeat(7, minmax(120px, 1fr)) minmax(150px, 1fr)`,
            overflowX: 'auto',
            pb: 1,
          }}
        >
          {showUnfinished && <Box sx={{ gridColumn: 1, gridRow: `1 / span ${rows}` }}>{lists[UNFINISHED]}</Box>}
          {days}
          <Box sx={{ gridColumn: lead + 8, gridRow: `1 / span ${rows}` }}>{lists[FUTURE]}</Box>
        </Box>
      )
    }
    // Too narrow for nine columns: Unfinished above the days, Future below.
    return (
      <Box data-testid="board-grid" data-layout="stacked" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {showUnfinished && lists[UNFINISHED]}
        <Box sx={{ display: 'grid', gap: 1, alignItems: 'start', gridTemplateColumns: 'repeat(7, minmax(160px, 1fr))', overflowX: 'auto', pb: 1 }}>
          {days}
        </Box>
        {lists[FUTURE]}
      </Box>
    )
  }

  return (
    <Box data-testid="task-board" ref={setBoardEl}>
      <PageHeader breadcrumbs={[{ label: 'Brewery', to: '/brewery' }, { label: 'Tasks' }]} title="Tasks" toolbar={<span />} />
      <BoardToolbar
        from={from}
        to={to}
        span={highlighted}
        filter={filter}
        hideCompleted={hideCompleted}
        onPrev={() => showRange(addDaysKey(from, -length), addDaysKey(to, -length))}
        onNext={() => showRange(addDaysKey(from, length), addDaysKey(to, length))}
        onToday={() => setParams({})}
        onSpan={pickSpan}
        onRange={showRange}
        onFilter={setFilter}
        onHideCompleted={toggleHide}
      />
      {isError && !board && <Alert severity="error">{taskError(error)}</Alert>}
      {isLoading && !board && <CircularProgress />}
      {board && (
        <SortableLists
          containers={containers}
          onMove={moveTask}
          isLocked={isLocked}
          itemLabel={(key) => cards.get(key)?.title ?? 'task'}
          containerLabel={(id) => (id === FUTURE ? 'Future' : id === UNFINISHED ? 'Unfinished' : formatTaskDay(id))}
          onItemActivate={(key, element) => setMenu({ key, anchor: element })}
          renderItem={(key, state) => {
            const card = cards.get(key)
            return card ? (
              <TaskCard
                card={card}
                overlay={state.overlay}
                dragging={state.dragging}
                showDate={card.day === UNFINISHED}
                onToggle={toggle}
                onOpen={(c, anchor) => setMenu({ key: c.key, anchor })}
              />
            ) : null
          }}
          renderContainer={renderContainer}
        >
          {layout}
        </SortableLists>
      )}

      {menu && menuCard && (
        <TaskMenu
          anchor={menu.anchor}
          card={menuCard}
          canMoveUp={menuOwn.indexOf(menuCard.key) > 0}
          canMoveDown={menuOwn.indexOf(menuCard.key) > -1 && menuOwn.indexOf(menuCard.key) < menuOwn.length - 1}
          onClose={() => setMenu(null)}
          onAction={onAction}
        />
      )}
      {dialog && (
        <TaskDialog
          key={dialog.n}
          mode={dialog.mode}
          brewers={brewers}
          today={today}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null)
            refresh()
          }}
          onDelete={setDeleting}
        />
      )}
      {finishing && (
        <FinishElsewhereDialog
          key={finishing.key}
          card={finishing}
          today={today}
          onCancel={() => setFinishing(null)}
          onConfirm={(display) => {
            setFinishing(null)
            complete(finishing, display)
          }}
        />
      )}
      {changingDay && (
        <ChangeDayDialog
          key={changingDay.key}
          card={changingDay}
          today={today}
          onCancel={() => setChangingDay(null)}
          onMove={(dueOn) => changeDay(changingDay, dueOn)}
        />
      )}
      <ConfirmDialog
        open={!!reopening}
        onClose={() => setReopening(null)}
        onConfirm={() => {
          if (reopening) uncomplete(reopening)
          setReopening(null)
        }}
        title="Mark not done?"
        message={reopening?.due_on ? `"${reopening.title}" goes back to open on ${formatTaskDay(reopening.due_on)}.` : ''}
        confirmLabel="Mark not done"
        confirmColor="primary"
      />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteTask(deleting)}
        title="Delete task"
        message={deleting ? `Delete '${deleting.title}'?` : ''}
        loading={busy}
      />
      <ConfirmDialog
        open={movingAll}
        onClose={() => setMovingAll(false)}
        onConfirm={moveAllToToday}
        title="Move all to today"
        message={`Move ${board?.unfinished.length ?? 0} unfinished ${board?.unfinished.length === 1 ? 'task' : 'tasks'} to today?`}
        confirmLabel="Move"
        confirmColor="primary"
        loading={busy}
      />
      <Snackbar
        open={!!toast}
        autoHideDuration={5000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={toast?.error ? 'error' : 'success'} onClose={() => setToast(null)} data-testid="board-toast" variant="filled">
          {toast?.message}
        </Alert>
      </Snackbar>
    </Box>
  )
}
