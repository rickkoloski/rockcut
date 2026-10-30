import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Box, CircularProgress, Snackbar } from '@mui/material'
import { keepPreviousData, useQueryClient } from '@tanstack/react-query'
import ConfirmDialog from '../../components/ConfirmDialog'
import { ActingBanner } from '../../components/ActingCode'
import SortableLists, { type ContainerSlot } from '../../components/dnd/SortableLists'
import { containerOf, type ListContainer, type Move } from '../../components/dnd/moveModel'
import { useOptimisticLists } from '../../components/dnd/useOptimisticLists'
import { useApiQuery } from '../../hooks/useApiQuery'
import useAuth from '../../hooks/useAuth'
import useActing, { actingRun } from '../../hooks/useActing'
import { usePhoneBackCloses } from '../../hooks/useBackCloses'
import api from '../../lib/api'
import { deleteWithCode, isActingCancelled, withCode } from '../../lib/acting'
import {
  BOARD_QUERY_KEY as BOARD_KEY,
  DAILY_ITEMS_KEY,
  FUTURE,
  UNFINISHED,
  boardPath,
  cardShown,
  coloradoToday,
  formatTaskDay,
  boardMoveRule,
  linkedStep,
  taskError,
  writeBoard,
  type TaskFilter,
} from '../../lib/tasks'
import type { CompletedDisplay, DailyCardItem, DailyItem, RosterEntry, TaskBoardData, TaskBoardEntry, TaskCardData, TaskSeriesData } from '../../lib/types'
import BoardLayout from './BoardLayout'
import BoardSwitcher from './BoardSwitcher'
import PageTitle from '../../components/PageTitle'
import BoardToolbar from './BoardToolbar'
import ChangeDayDialog from './ChangeDayDialog'
import DailyItemsDialog from './DailyItemsDialog'
import HistoryDialog from './HistoryDialog'
import { RemoveLaterDialog, ScopeDialog, type Changed, type SeriesScope } from './SeriesDialogs'
import DayColumn from './DayColumn'
import FinishElsewhereDialog from './FinishElsewhereDialog'
import FutureList from './FutureList'
import TaskCard from './TaskCard'
import TaskDialog, { type TaskDialogMode } from './TaskDialog'
import TaskMenu, { type TaskAction } from './TaskMenu'
import UnfinishedCard from './UnfinishedCard'
import LinkedTaskDialog from './LinkedTaskDialog'
import ExtendSeriesDialog from './ExtendSeriesDialog'
import { scrollToStop, useBoardView } from './useBoardView'
import { FlowsProvider } from '../production/Gantt/flows'
import { useFlows } from '../production/Gantt/flowsContext'
import { daysBetween } from '../../lib/gantt'


interface Props {
  /** The board showing (D41: one per department, from the URL). */
  board: TaskBoardEntry
  /** Every board this person can open, for the switcher. */
  boards: TaskBoardEntry[]
}

/**
 * D38: the task board (D41: one per department, at `/tasks/<dept>`). The days in the range (in rows of seven), each with
 * its schedule header, Daily card and tasks; the Unfinished card first and
 * the Future list last. Every list is one container in a single
 * SortableLists, so a drag between any two of them is one move. At phone
 * width (D39) it's every day stacked (PhoneVerticalView, drags anywhere) or
 * one day at a time (PhoneDayView: drags stay in the day, or come from the
 * Unfinished card into today). D41: `?day=` opens it at that day (the All
 * departments view's links).
 */
export default function TaskBoard(props: Props) {
  // D49 §3.12: a linked task's writes run the production schedule's prompts and Undo.
  return (
    <FlowsProvider>
      <BoardScreen {...props} />
    </FlowsProvider>
  )
}

function BoardScreen({ board: boardEntry, boards }: Props) {
  const flows = useFlows()
  const dept = boardEntry.key
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { user } = useAuth()
  // History and Edit Daily items (the department's managers and owners, never a device).
  const isDevice = user?.kind === 'device'
  const canManage = boardEntry.manage && !isDevice
  // D49: "Show planned batches", per person on the server (a tablet has none of its own).
  const showPlanned = useAuth((s) => s.showPlannedBatches) || isDevice
  const setShowPlanned = useAuth((s) => s.setShowPlannedBatches)
  // Who a change shows as at once: the person, or on a tablet who it's acting as.
  const actingName = useActing((s) => s.session?.name ?? null)
  const myName = isDevice ? actingName : (user?.name ?? null)
  // D41: the board last opened is the one `/tasks` opens.
  useEffect(() => writeBoard(dept), [dept])
  /** Another board, at the same range. */
  const switchBoard = (key: string) => {
    writeBoard(key)
    navigate({ pathname: `/tasks/${key}`, search: window.location.search })
  }
  const {
    from, to, highlighted, hideCompleted, hideShifts, phoneView, phone, wide, focus, clearFocus,
    setBoardEl, step, showToday, pickSpan, toggleHide, toggleHideShifts, setPhoneView, firstDay, pickFirstDay,
  } = useBoardView(dept)
  const [filter, setFilter] = useState<TaskFilter>('all')

  const { data: board, isLoading, isError, error, dataUpdatedAt } = useApiQuery<TaskBoardData>(
    [BOARD_KEY, dept, from, to],
    boardPath(dept, 'tasks'),
    { from, to },
    // Back to the tab: always fresh, even within the default 30 seconds (and
    // Edit Daily items with it, O-2).
    { refetchInterval: 60_000, refetchOnWindowFocus: 'always', placeholderData: keepPreviousData },
  )
  const { data: roster = [] } = useApiQuery<RosterEntry[]>(['roster'], '/api/roster')
  // The board's department's members: the people a task can be assigned to.
  const members = useMemo(() => roster.filter((r) => r.departments.includes(dept)), [roster, dept])
  // D41 S107: the Daily card hides until the board has an item, and a manager's
  // ⋮ menu says "Set up Daily checks" instead of "Edit Daily items" until then.
  // The entry waits for the board's items: while they load it would claim
  // either (DEV fix cycle 1, S111).
  const { data: dailyItems } = useApiQuery<DailyItem[]>([DAILY_ITEMS_KEY, dept], boardPath(dept, 'daily_items'), { include_retired: 'true' })
  const hasDailyItems = dailyItems?.some((i) => i.active) ?? false
  const today = board?.today ?? coloradoToday()

  // Phone: the day (or FUTURE) showing. It starts on today, or the range's
  // first day when today isn't in it.
  const [picked, setPicked] = useState<string | null>(null)
  const stops = useMemo(() => [...(board?.days.map((d) => d.date) ?? []), FUTURE], [board])
  const selected = picked && stops.includes(picked) ? picked : stops.includes(today) ? today : stops[0]

  // D41 `?day=`: once the board holds that day, show it (phone one-day: select it).
  useEffect(() => {
    if (!focus || !board || !stops.includes(focus)) return
    if (phone && phoneView === 'day') setPicked(focus)
    else scrollToStop(focus)
    clearFocus()
  }, [focus, board, stops, phone, phoneView, clearFocus])

  // Every card by key, and the lists as the filter shows them.
  const { cards, source } = useMemo(() => {
    const cards = new Map<string, TaskCardData>()
    const source: ListContainer[] = []
    if (!board) return { cards, source }
    const list = (id: string, items: TaskCardData[]) => {
      items.forEach((c) => cards.set(c.key, c))
      const shown = (c: TaskCardData) => cardShown(c, filter, hideCompleted, user?.id) && (showPlanned || !c.production?.planned)
      source.push({ id, itemIds: items.filter(shown).map((c) => c.key) })
    }
    list(UNFINISHED, board.unfinished)
    board.days.forEach((d) => list(d.date, d.cards))
    list(FUTURE, board.future)
    return { cards, source }
  }, [board, filter, hideCompleted, user?.id, showPlanned])

  // D49: a linked task can't be dragged on a tablet (read-only until D50), nor once it's done (its step is).
  const isLocked = useCallback(
    (key: string) => {
      const card = cards.get(key)
      return !!card && (card.locked || (!!card.production && (isDevice || card.done)))
    },
    [cards, isDevice],
  )
  // Finished on a day away from their planned one: the server lists them after the day's own tasks.
  const staysLast = useCallback((key: string) => {
    const card = cards.get(key)
    return !!card && card.day !== FUTURE && card.day !== UNFINISHED && card.due_on !== card.day
  }, [cards])
  const { containers, move } = useOptimisticLists(source, isLocked)

  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null)
  const [menu, setMenu] = useState<{ key: string; anchor: HTMLElement } | null>(null)
  const [dialog, setDialog] = useState<{ mode: TaskDialogMode; n: number } | null>(null)
  const [finishing, setFinishing] = useState<TaskCardData | null>(null)
  const [reopening, setReopening] = useState<TaskCardData | null>(null)
  const [changingDay, setChangingDay] = useState<TaskCardData | null>(null)
  const [deleting, setDeleting] = useState<TaskCardData | null>(null)
  // D39: an occurrence's delete asks which ones, then (for "following", or
  // Stop repeating) confirms the later ones it removes (Decision 2).
  const [deletingSeries, setDeletingSeries] = useState<TaskCardData | null>(null)
  const [removing, setRemoving] = useState<{ card: TaskCardData; kind: 'delete' | 'stop'; laterOpen: number; laterChanged: number } | null>(
    null,
  )
  const [movingAll, setMovingAll] = useState(false)
  // D52: "Extend the series?" for a series' last occurrence (after its check-off, or from its menu).
  const [extending, setExtending] = useState<{ card: TaskCardData; justDone: boolean } | null>(null)
  const [editingDaily, setEditingDaily] = useState(false)
  // History: the whole board's, or one task's (from its dialog).
  const [history, setHistory] = useState<{ task?: { id: number; title: string } } | null>(null)
  const [busy, setBusy] = useState(false)
  // S76: at phone width, back closes the board's confirms (the dialogs do their own).
  usePhoneBackCloses(!!reopening, () => setReopening(null))
  usePhoneBackCloses(!!deleting, () => setDeleting(null))
  usePhoneBackCloses(movingAll, () => setMovingAll(false))
  usePhoneBackCloses(!!removing && removing.laterOpen + removing.laterChanged === 0, () => setRemoving(null))

  const refresh = () => qc.invalidateQueries({ queryKey: [BOARD_KEY, dept] })
  // D40: a cancelled staff-code dialog isn't an error; the write never ran.
  const fail = (err: unknown) => {
    if (!isActingCancelled(err)) setToast({ message: taskError(err), error: true })
  }
  // Optimistic writes still waiting on the server. The board refetches when the
  // last one settles: a refetch between two quick ticks would undo the second.
  const pending = useRef(0)

  /**
   * A write with an optional optimistic change to the cached board, rolled
   * back on failure. D40: `write` gets the staff code on a shared tablet
   * (`actingRun` asks for one first); people get none. The change is shown
   * only when the write is sent (with a code, on a tablet), and undone as
   * soon as that try fails, so nothing shows ticked behind the code dialog
   * or after a wrong code (D40 DEV qa gap 3).
   */
  const run = async (write: (code?: string) => Promise<unknown>, optimistic?: (b: TaskBoardData) => TaskBoardData) => {
    const queryKey = [BOARD_KEY, dept, from, to]
    pending.current += 1
    const attempt = async (code?: string) => {
      // Cancels a fetch in flight at once (no await, so the change shows on this click).
      if (optimistic) void qc.cancelQueries({ queryKey })
      const before = qc.getQueryData<TaskBoardData>(queryKey)
      if (before && optimistic) qc.setQueryData(queryKey, optimistic(before))
      try {
        return await write(code)
      } catch (err) {
        if (before && optimistic) qc.setQueryData(queryKey, before)
        throw err
      }
    }
    try {
      await actingRun(attempt)
      return true
    } catch (err) {
      fail(err)
      return false
    } finally {
      pending.current -= 1
      if (pending.current === 0) refresh()
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
    // Ahead of a card that stays last means the end of the day's own tasks.
    const before = m.beforeId && !staysLast(m.beforeId) ? cards.get(m.beforeId) : null
    const beforeId = before && before.id !== card.id ? before.id : null
    // D49: a linked task on another day moves its step, with the move prompt;
    // cancelling it puts the card back. Within its day it's the board's order.
    if (card.production && dueOn !== card.due_on) {
      if (dueOn === null) return setToast({ message: 'A task from the production schedule stays on a day', error: true })
      move(m, () => moveLinked(card, dueOn)).catch(() => undefined)
      return
    }
    // D40: on a tablet the card moves only once the code is in (each try moves
    // it, and a refused try puts it back).
    actingRun((code) =>
      move(m, () => api.post(boardPath(dept, 'tasks', card.id, 'move'), withCode({ due_on: dueOn, before_id: beforeId }, code))),
    )
      .catch(fail)
      .finally(refresh)
  }

  /** D49: move a linked task's step to `dueOn` (the move prompt); rejects when cancelled or refused (the prompt says why). */
  const moveLinked = async (card: TaskCardData, dueOn: string) => {
    const r = await flows.moveSteps([card.production!.step_id], daysBetween(card.due_on!, dueOn))
    if (!r?.ok) throw new Error('not moved')
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
    if (card.production) {
      if (dueOn) moveLinked(card, dueOn).catch(() => undefined)
      return
    }
    run((code) => api.post(boardPath(dept, 'tasks', card.id, 'move'), withCode({ due_on: dueOn, before_id: null }, code))).then(
      (ok) => ok && setToast({ message: `Moved "${card.title}" to ${dueOn ? formatTaskDay(dueOn) : 'Future'}` }),
    )
  }

  // ── Completing ─────────────────────────────────────────────────────

  const setDone = (taskId: number, done: boolean) => (b: TaskBoardData): TaskBoardData => {
    const patch = (c: TaskCardData) => (c.id === taskId ? { ...c, done, completed_by_name: done ? myName : null } : c)
    return {
      ...b,
      unfinished: b.unfinished.map(patch),
      future: b.future.map(patch),
      days: b.days.map((d) => ({ ...d, cards: d.cards.map(patch) })),
    }
  }

  const complete = (card: TaskCardData, display?: CompletedDisplay) =>
    run((code) => api.post(boardPath(dept, 'tasks', card.id, 'complete'), withCode(display ? { display } : {}, code)), setDone(card.id, true))

  // D52: anyone who can edit the series is offered to extend it; a shared tablet isn't.
  const canExtend = (card: TaskCardData) => !isDevice && card.series_id != null && card.series_last && !card.production

  /** Checking off a series' last occurrence asks whether to extend the series. */
  const completeAndOffer = async (card: TaskCardData, display?: CompletedDisplay) => {
    const ok = await complete(card, display)
    if (ok && canExtend(card)) setExtending({ card, justDone: true })
  }

  const uncomplete = (card: TaskCardData) =>
    run((code) => api.post(boardPath(dept, 'tasks', card.id, 'uncomplete'), withCode({}, code)), setDone(card.id, false))

  /**
   * D49: a linked task checks off its step: the batch-number and off-plan
   * move prompts, never "where should it show" (it shows on the day it was
   * done). Refusals say why in the schedule's snackbar.
   */
  const toggleLinked = async (card: TaskCardData) => {
    const step = linkedStep(card)!
    const r = card.done ? await flows.uncheck(step) : await flows.checkOff(step, today, step.batchLabel)
    if (r && !r.ok) flows.notify(r.error)
  }

  const toggle = (card: TaskCardData) => {
    if (card.production) return void toggleLinked(card)
    if (card.done) {
      // Shown on the day it was finished: reopening moves it back, so ask (§3.8).
      const elsewhere = card.due_on !== null && card.completed_display !== 'planned_day' && card.completed_on !== card.due_on
      if (elsewhere) setReopening(card)
      else uncomplete(card)
    } else if (card.due_on === null || card.due_on === today) {
      completeAndOffer(card)
    } else {
      setFinishing(card)
    }
  }

  // ── Daily card ─────────────────────────────────────────────────────

  /** Tick or untick one check, shown at once and rolled back if refused. */
  const toggleDaily = (date: string, item: DailyCardItem) => {
    const checked = !item.checked
    const optimistic = (b: TaskBoardData): TaskBoardData => ({
      ...b,
      days: b.days.map((d) => {
        if (d.date !== date) return d
        return {
          ...d,
          daily: {
            ...d.daily,
            done: d.daily.done + (checked ? 1 : -1),
            items: d.daily.items.map((i) =>
              i.daily_item_id === item.daily_item_id
                ? {
                    ...i,
                    checked,
                    completed_by_name: checked ? myName : null,
                    completed_at: checked ? new Date().toISOString() : null,
                  }
                : i,
            ),
          },
        }
      }),
    })
    const path = boardPath(dept, 'daily_checks', date, item.daily_item_id)
    run((code) => (checked ? api.put(path, withCode({}, code)) : api.delete(path, deleteWithCode(undefined, code))), optimistic)
  }

  // ── Menu ───────────────────────────────────────────────────────────

  const menuCard = menu ? cards.get(menu.key) : undefined
  const menuContainer = menu ? containerOf(containers, menu.key) : null
  const menuOwn = menuContainer ? ownKeys(menuContainer) : []

  /** D49: the step dialog on the Gantt, around the step's day. */
  const openInSchedule = (card: TaskCardData | null) => {
    if (!card?.production) return
    navigate(`/brewery/production?step=${card.production.step_id}&day=${card.due_on}`)
  }

  const onAction = (action: TaskAction) => {
    if (!menuCard) return
    switch (action) {
      case 'edit':
      case 'notes':
        return setDialog({ mode: { kind: 'edit', card: menuCard, focusNotes: action === 'notes' }, n: Date.now() })
      case 'edit-series':
        return setDialog({ mode: { kind: 'edit', card: menuCard, series: true }, n: Date.now() })
      case 'extend':
        return setExtending({ card: menuCard, justDone: false })
      case 'stop-repeating':
        return askRemoveLater(menuCard, 'stop')
      case 'toggle':
        return toggle(menuCard)
      case 'change-day':
        return setChangingDay(menuCard)
      case 'up':
      case 'down':
        return menuContainer && moveStep(menuCard, menuContainer, action)
      case 'delete':
        return startDelete(menuCard)
      case 'open-schedule':
        return openInSchedule(menuCard)
    }
  }

  const startDelete = (card: TaskCardData) => (card.series_id != null ? setDeletingSeries(card) : setDeleting(card))

  /** D49: off the task list (200 with the schedule's Undo); the step stays. */
  const takeOffList = async (card: TaskCardData) => {
    setBusy(true)
    const r = await flows.write(() => api.delete(boardPath(dept, 'tasks', card.id)), `"${card.title}" is off the task list. It stays on the production schedule.`)
    setBusy(false)
    if (!r.ok) return flows.notify(r.error)
    setDeleting(null)
    setDialog(null)
  }

  const deleteTask = async (card: TaskCardData, params?: { scope: SeriesScope; changed?: Changed }) => {
    setBusy(true)
    const ok = await run((code) => api.delete(boardPath(dept, 'tasks', card.id), deleteWithCode(params, code)))
    setBusy(false)
    if (ok) {
      setDeleting(null)
      setDeletingSeries(null)
      setRemoving(null)
      setDialog(null)
      setToast({ message: params?.scope === 'following' ? `Deleted "${card.title}" and the later ones` : `Deleted "${card.title}"` })
    }
  }

  /** Stop repeating, or Delete "This and all following": confirm with the later counts. */
  const askRemoveLater = async (card: TaskCardData, kind: 'delete' | 'stop') => {
    setBusy(true)
    try {
      const { data } = await api.get<{ data: TaskSeriesData }>(boardPath(dept, 'tasks', card.id, 'series'))
      setDeletingSeries(null)
      setRemoving({ card, kind, laterOpen: data.data.later_open, laterChanged: data.data.later_changed })
    } catch (err) {
      fail(err)
      refresh()
    } finally {
      setBusy(false)
    }
  }

  const removeLater = async (changed: Changed) => {
    if (!removing) return
    const { card, kind } = removing
    if (kind === 'delete') return deleteTask(card, { scope: 'following', changed })
    setBusy(true)
    const ok = await run((code) => api.post(boardPath(dept, 'tasks', card.id, 'stop_repeating'), withCode({ changed }, code)))
    setBusy(false)
    if (ok) {
      setRemoving(null)
      setToast({ message: `"${card.title}" no longer repeats after ${formatTaskDay(card.series_date ?? card.due_on ?? today)}` })
    }
  }

  // D49: Move all leaves the linked tasks (their steps move with the move prompt).
  const movableCount = (board?.unfinished ?? []).filter((c) => !c.production).length

  const moveAllToToday = async () => {
    setBusy(true)
    let moved = 0
    const ok = await run(async (code) => {
      const res = await api.post<{ moved: number }>(boardPath(dept, 'tasks', 'move_overdue_to_today'), withCode({}, code))
      moved = res.data.moved
    })
    setBusy(false)
    setMovingAll(false)
    if (ok) setToast({ message: `Moved ${moved} ${moved === 1 ? 'task' : 'tasks'} to today` })
  }

  // ── Render ─────────────────────────────────────────────────────────

  const openCount = (id: string) =>
    (containers.find((c) => c.id === id)?.itemIds ?? []).filter((k) => {
      const c = cards.get(k)
      return c && !c.done
    }).length

  const renderContainer = (container: ListContainer, slot: ContainerSlot): ReactNode => {
    if (container.id === UNFINISHED)
      return <UnfinishedCard total={board?.unfinished.length ?? 0} movable={movableCount} slot={slot} onMoveAll={() => setMovingAll(true)} />
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
        hideShifts={hideShifts}
        slot={slot}
        onAdd={(date) => setDialog({ mode: { kind: 'add', dueOn: date }, n: Date.now() })}
        onDailyToggle={toggleDaily}
        onEditDailyItems={canManage && dailyItems ? () => setEditingDaily(true) : undefined}
      />
    )
  }

  const layout = (lists: Record<string, ReactNode>) =>
    board ? (
      <BoardLayout
        days={board.days.map((d) => d.date)}
        showUnfinished={board.unfinished.length > 0}
        lists={lists}
        phoneView={phone ? phoneView : null}
        wide={wide}
        stops={stops}
        selected={selected}
        today={today}
        onSelect={setPicked}
        openCount={openCount}
      />
    ) : null

  return (
    <Box data-testid="task-board" ref={setBoardEl}>
      {/* D40: "Acting as Kate · Done" on a shared tablet, pinned as the board scrolls. */}
      {isDevice && <ActingBanner />}
      {/* D43: the board's title and switcher sit in the top bar. */}
      <PageTitle>
        <BoardSwitcher board={boardEntry} boards={boards} onSwitch={switchBoard} compact />
      </PageTitle>
      <BoardToolbar
        span={highlighted}
        firstDay={firstDay}
        onFirstDay={pickFirstDay}
        filter={filter}
        hideCompleted={hideCompleted}
        onPrev={() => step(-1)}
        onNext={() => step(1)}
        onToday={() => {
          setPicked(null)
          showToday()
        }}
        onSpan={pickSpan}
        onFilter={setFilter}
        // D40: a shared tablet has no "My tasks" (plan decision 1).
        noMine={isDevice}
        onHideCompleted={toggleHide}
        hideShifts={hideShifts}
        onHideShifts={toggleHideShifts}
        // D49: only the Brewery board has the schedule's tasks; a tablet shows them all.
        showPlanned={dept === 'brewery' && !isDevice ? showPlanned : undefined}
        onShowPlanned={(show) => setShowPlanned(show).catch((err) => setToast({ message: taskError(err), error: true }))}
        onHistory={canManage ? () => setHistory({}) : undefined}
        onEditDailyItems={canManage && dailyItems ? () => setEditingDaily(true) : undefined}
        setUpDaily={!hasDailyItems}
        compact={phone}
        phoneView={phoneView}
        onPhoneView={setPhoneView}
      />
      {isError && !board && <Alert severity="error">{taskError(error)}</Alert>}
      {isLoading && !board && <CircularProgress />}
      {board && (
        <SortableLists
          containers={containers}
          onMove={moveTask}
          isLocked={isLocked}
          staysLast={staysLast}
          canMoveTo={boardMoveRule(phone ? phoneView : null, selected, today)}
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
                noCheck={isDevice && !!card.production}
                locked={state.locked}
                onToggle={toggle}
                onOpen={(c, anchor) => setMenu({ key: c.key, anchor })}
                // As the menu's Edit notes; a tablet can't edit a linked step's task (D49).
                onNotes={isDevice && card.production ? undefined : (c) => setDialog({ mode: { kind: 'edit', card: c, focusNotes: true }, n: Date.now() })}
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
          sheet={phone}
          linkedReadOnly={isDevice && !!menuCard.production}
          canExtend={canExtend(menuCard)}
          onClose={() => setMenu(null)}
          onAction={onAction}
        />
      )}
      {dialog && dialog.mode.kind === 'edit' && dialog.mode.card.production ? (
        <LinkedTaskDialog
          key={dialog.n}
          card={dialog.mode.card}
          board={boardEntry}
          members={members}
          focusNotes={dialog.mode.focusNotes}
          onClose={() => setDialog(null)}
          onDelete={startDelete}
          onOpenSchedule={() => openInSchedule(dialog.mode.kind === 'edit' ? dialog.mode.card : null)}
        />
      ) : dialog && (
        <TaskDialog
          key={dialog.n}
          mode={dialog.mode}
          board={boardEntry}
          members={members}
          today={today}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null)
            refresh()
          }}
          onStale={refresh}
          onDelete={startDelete}
          onHistory={canManage ? (card) => setHistory({ task: { id: card.id, title: card.title } }) : undefined}
        />
      )}
      {editingDaily && (
        <DailyItemsDialog board={boardEntry} onClose={() => setEditingDaily(false)} onChanged={refresh} boardUpdatedAt={dataUpdatedAt} />
      )}
      {history && <HistoryDialog board={boardEntry} task={history.task} onClose={() => setHistory(null)} />}
      {finishing && (
        <FinishElsewhereDialog
          key={finishing.key}
          card={finishing}
          today={today}
          onCancel={() => setFinishing(null)}
          onConfirm={(display) => {
            setFinishing(null)
            completeAndOffer(finishing, display)
          }}
        />
      )}
      {extending && (
        <ExtendSeriesDialog
          board={boardEntry}
          card={extending.card}
          justDone={extending.justDone}
          onClose={() => setExtending(null)}
          onPickEnd={(c) => {
            setExtending(null)
            // The card as the board now has it (it may have just been checked off).
            setDialog({ mode: { kind: 'edit', card: cards.get(c.key) ?? c, series: true }, n: Date.now() })
          }}
          onExtended={(message) => {
            setExtending(null)
            refresh()
            setToast({ message })
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
        onConfirm={() => deleting && (deleting.production ? takeOffList(deleting) : deleteTask(deleting))}
        title={deleting?.production ? 'Take off the task list' : 'Delete task'}
        message={deleting ? (deleting.production ? 'Take this off the task list? It stays on the production schedule.' : `Delete '${deleting.title}'?`) : ''}
        confirmLabel={deleting?.production ? 'Take off' : undefined}
        loading={busy}
      />
      {deletingSeries && (
        <ScopeDialog
          action="delete"
          loading={busy}
          onChoose={(scope) => (scope === 'this' ? deleteTask(deletingSeries, { scope }) : askRemoveLater(deletingSeries, 'delete'))}
          onCancel={() => setDeletingSeries(null)}
        />
      )}
      {removing && removing.laterOpen + removing.laterChanged > 0 && (
        <RemoveLaterDialog
          title={removing.kind === 'stop' ? 'Stop repeating' : 'Delete this and all following'}
          laterOpen={removing.laterOpen}
          laterChanged={removing.laterChanged}
          loading={busy}
          onConfirm={removeLater}
          onCancel={() => setRemoving(null)}
        />
      )}
      <ConfirmDialog
        open={!!removing && removing.laterOpen + removing.laterChanged === 0}
        onClose={() => setRemoving(null)}
        onConfirm={() => removeLater('keep')}
        title={removing?.kind === 'stop' ? 'Stop repeating' : 'Delete this and all following'}
        message={
          removing?.kind === 'stop'
            ? `"${removing.card.title}" stops repeating after this one. There are no later ones.`
            : `Delete '${removing?.card.title ?? ''}'? There are no later ones.`
        }
        confirmLabel={removing?.kind === 'stop' ? 'Stop repeating' : 'Delete'}
        loading={busy}
      />
      <ConfirmDialog
        open={movingAll}
        onClose={() => setMovingAll(false)}
        onConfirm={moveAllToToday}
        title="Move all to today"
        message={`Move ${movableCount} unfinished ${movableCount === 1 ? 'task' : 'tasks'} to today?`}
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
