import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, Box, Chip, CircularProgress, Paper, Typography } from '@mui/material'
import { keepPreviousData } from '@tanstack/react-query'
import { useApiQuery } from '../../hooks/useApiQuery'
import {
  ALL_BOARDS,
  FUTURE,
  PAST_OPACITY,
  UNFINISHED,
  allBoardCardLink,
  boardPath,
  cardShown,
  coloradoToday,
  departmentSections,
  formatTaskDay,
  taskError,
  writeBoard,
  type DepartmentSection,
  type TaskFilter,
} from '../../lib/tasks'
import type { AllBoardCard, AllBoardData, DailyCount, TaskBoardEntry } from '../../lib/types'
import BoardLayout from './BoardLayout'
import BoardSwitcher from './BoardSwitcher'
import PageTitle from '../../components/PageTitle'
import BoardToolbar from './BoardToolbar'
import TaskCard from './TaskCard'
import { useBoardView } from './useBoardView'

interface Props {
  /** The All departments entry of `task_boards`. */
  board: TaskBoardEntry
  /** Every entry of `task_boards`: the switcher, and the departments' names and colors. */
  boards: TaskBoardEntry[]
}

const NO_COUNTS: DailyCount[] = []

/**
 * D41 §3.6: the All departments view, owners only, at `/tasks/all`. The
 * board's range, 1 week / 2 weeks, date range, filter (All / Unassigned),
 * Hide completed and phone views, over every board at once: each day holds a
 * section per department with something that day (its color and name, its
 * Daily count when its board has items, its cards), in department order.
 * Unfinished and Future are grouped the same way. There's no schedule header.
 *
 * Read-only: no checkbox, drag, Add, Move all to today, task menu or manager
 * tools. A card opens its own board at its day (`/tasks/<dept>?day=`).
 */
export default function AllBoard({ board: entry, boards }: Props) {
  const navigate = useNavigate()
  const {
    from, to, highlighted, hideCompleted, phoneView, phone, wide,
    setBoardEl, step, showToday, pickSpan, toggleHide, setPhoneView, firstDay, pickFirstDay,
  } = useBoardView(ALL_BOARDS)
  // "My tasks" isn't offered here; the board's own filter isn't remembered, so nothing to keep.
  const [filter, setFilter] = useState<TaskFilter>('all')
  const [picked, setPicked] = useState<string | null>(null)

  const { data, isLoading, isError, error } = useApiQuery<AllBoardData>(
    ['task-board', ALL_BOARDS, from, to],
    boardPath(ALL_BOARDS, 'tasks'),
    { from, to },
    { refetchInterval: 60_000, refetchOnWindowFocus: 'always', placeholderData: keepPreviousData },
  )
  const today = data?.today ?? coloradoToday()
  const shown = (c: AllBoardCard) => cardShown(c, filter, hideCompleted, undefined)
  const sections = (cards: AllBoardCard[], counts: DailyCount[] = NO_COUNTS) => departmentSections(boards, cards, counts, shown)

  const stops = useMemo(() => [...(data?.days.map((d) => d.date) ?? []), FUTURE], [data])
  const selected = picked && stops.includes(picked) ? picked : stops.includes(today) ? today : stops[0]

  const open = (card: AllBoardCard) => navigate(allBoardCardLink(card, today))
  const openCount = (cards: AllBoardCard[]) => cards.filter((c) => shown(c) && !c.done).length
  const stopCount = (stop: string) => openCount(stop === FUTURE ? (data?.future ?? []) : (data?.days.find((d) => d.date === stop)?.cards ?? []))

  const list = (items: DepartmentSection[], showDate = false) =>
    items.map((s) => <Section key={s.board.key} section={s} showDate={showDate} onOpen={open} />)

  const lists: Record<string, ReactNode> = {}
  if (data) {
    lists[UNFINISHED] = (
      <Paper variant="outlined" data-testid="unfinished-card" sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 1, borderColor: 'warning.main', bgcolor: 'background.boardColumn' }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }} data-testid="unfinished-title">
          Unfinished ({data.unfinished.length})
        </Typography>
        {list(sections(data.unfinished), true)}
      </Paper>
    )
    data.days.forEach((d) => {
      const isToday = d.date === today
      const isPast = d.date < today
      const daySections = sections(d.cards, d.daily_counts)
      lists[d.date] = (
        <Paper
          variant="outlined"
          data-testid={`day-${d.date}`}
          data-today={isToday}
          data-past={isPast}
          sx={{
            opacity: isPast ? PAST_OPACITY : undefined,
            p: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            minWidth: 0,
            borderColor: isToday ? 'primary.main' : undefined,
            borderWidth: isToday ? 2 : 1,
            bgcolor: isToday ? 'background.boardToday' : 'background.boardColumn',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Typography variant="subtitle2" data-testid={`day-title-${d.date}`} sx={{ fontWeight: isToday ? 700 : 600 }}>
              {formatTaskDay(d.date)}
              {isToday && ' · Today'}
            </Typography>
            <Chip size="small" label={openCount(d.cards)} data-testid={`day-count-${d.date}`} aria-label={`${openCount(d.cards)} open`} sx={{ height: 20 }} />
          </Box>
          {daySections.length > 0 ? (
            list(daySections)
          ) : (
            <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }} data-testid={`day-empty-${d.date}`}>
              No tasks
            </Typography>
          )}
        </Paper>
      )
    })
    const futureSections = sections(data.future)
    lists[FUTURE] = (
      <Paper variant="outlined" data-testid="future-list" sx={{ p: 1, display: 'flex', flexDirection: 'column', gap: 1, bgcolor: 'background.boardColumn' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Future
          </Typography>
          <Chip size="small" label={openCount(data.future)} data-testid="future-count" aria-label={`${openCount(data.future)} open`} sx={{ height: 20 }} />
        </Box>
        {futureSections.length > 0 ? (
          list(futureSections)
        ) : (
          <Typography variant="caption" color="text.secondary" sx={{ p: 1 }} data-testid="future-empty">
            Nothing here.
          </Typography>
        )}
      </Paper>
    )
  }

  const switcher = (compact?: boolean) => (
    <BoardSwitcher
      board={entry}
      boards={boards}
      compact={compact}
      onSwitch={(key) => {
        writeBoard(key)
        navigate({ pathname: `/tasks/${key}`, search: window.location.search })
      }}
    />
  )

  return (
    <Box data-testid="task-board" data-board="all" ref={setBoardEl}>
      {/* D43: the board's title and switcher sit in the top bar. */}
      <PageTitle>{switcher(true)}</PageTitle>
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
        onHideCompleted={toggleHide}
        noMine
        compact={phone}
        phoneView={phoneView}
        onPhoneView={setPhoneView}
      />
      {isError && !data && <Alert severity="error">{taskError(error)}</Alert>}
      {isLoading && !data && <CircularProgress />}
      {data && (
        <BoardLayout
          days={data.days.map((d) => d.date)}
          showUnfinished={data.unfinished.length > 0}
          lists={lists}
          phoneView={phone ? phoneView : null}
          wide={wide}
          stops={stops}
          selected={selected}
          today={today}
          onSelect={setPicked}
          openCount={stopCount}
        />
      )}
    </Box>
  )
}

/** One department's part of a day (or of Unfinished or Future): name, Daily count, cards. */
function Section({ section: { board, cards, daily }, showDate, onOpen }: { section: DepartmentSection; showDate: boolean; onOpen: (card: AllBoardCard) => void }) {
  return (
    <Box data-testid={`section-${board.key}`} data-department={board.key} sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, borderBottom: 2, borderColor: board.color ?? 'divider', pb: 0.25 }}>
        <Box component="span" sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: board.color ?? 'grey.500', flexShrink: 0 }} />
        <Typography variant="caption" sx={{ fontWeight: 700, flex: 1, minWidth: 0 }} data-testid={`section-name-${board.key}`}>
          {board.name}
        </Typography>
        {daily && (
          <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }} data-testid={`section-daily-${board.key}`}>
            Daily {daily.done}/{daily.total}
          </Typography>
        )}
      </Box>
      {cards.map((c) => (
        <TaskCard key={c.key} card={c} showDate={showDate} readOnly onOpen={() => onOpen(c)} />
      ))}
    </Box>
  )
}
