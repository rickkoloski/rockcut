import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Alert, Box, Button, CircularProgress, Divider, MenuItem, Paper, Snackbar, Tab, Tabs, TextField, useMediaQuery, useTheme } from '@mui/material'
import { Add } from '@mui/icons-material'
import { useQueryClient } from '@tanstack/react-query'
import SortableLists, { type ContainerSlot } from '../../components/dnd/SortableLists'
import DropTarget from '../../components/dnd/DropTarget'
import { containerOf, type ListContainer, type Move } from '../../components/dnd/moveModel'
import { useOptimisticLists } from '../../components/dnd/useOptimisticLists'
import { PageToolbar, SettingsChoices, SettingsGear, type Choice } from '../../components/SettingsMenu'
import PageTitle from '../../components/PageTitle'
import { useApiQuery } from '../../hooks/useApiQuery'
import useAuth from '../../hooks/useAuth'
import api from '../../lib/api'
import { coloradoToday } from '../../lib/tasks'
import { IDEA_BOARD_KEY, cardShown, ideaBoardTitle, ideaError, ideaPath, writeIdeaBoard, type IdeaFilter } from '../../lib/ideas'
import type { IdeaBoardData, IdeaBoardEntry, IdeaCardFace as Face, IdeaLabel, IdeaListData, IdeaPerson } from '../../lib/types'
import BoardSwitcher from '../tasks/BoardSwitcher'
import IdeaListColumn, { type ListAction } from './IdeaListColumn'
import IdeaCardFace from './IdeaCardFace'
import IdeaCardDialog from './IdeaCardDialog'
import ArchivedDialog from './ArchivedDialog'
import IdeaHistoryDialog from './IdeaHistoryDialog'

interface Props {
  board: IdeaBoardEntry
  boards: IdeaBoardEntry[]
  /** `/ideas/:board/cards/:id`: the card open in its dialog. */
  cardId: number | null
}

const listKey = (id: number) => `list-${id}`
const cardKey = (id: number) => `card-${id}`
const idOf = (key: string) => Number(key.slice(key.indexOf('-') + 1))

/**
 * D53 §4.4: an Idea Board. Its lists side by side, scrolling sideways, with
 * "+ Add a list" at the end; at phone width one list at a time under tabs,
 * and a long press drags a card onto another list's tab. Cards drag within
 * and between lists (the shared `SortableLists` layer); lists move with
 * their ⋮ menu. A card opens in its dialog at its own URL. The gear holds the
 * filter, Archived and History. A shared tablet sees the same board with no
 * controls (§4.2). The board refetches when the tab comes back.
 */
export default function IdeaBoard({ board, boards, cardId }: Props) {
  const key = board.key
  const qc = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const theme = useTheme()
  const phone = useMediaQuery(theme.breakpoints.down('sm'), { noSsr: true })
  const { user } = useAuth()
  const isDevice = user?.kind === 'device'
  const canWrite = !isDevice
  const manage = board.manage && !isDevice
  const today = coloradoToday()
  useEffect(() => writeIdeaBoard(key), [key])

  const { data, isLoading, isError, error } = useApiQuery<IdeaBoardData>([IDEA_BOARD_KEY, key], ideaPath(key, 'lists'), undefined, {
    refetchInterval: 60_000,
    refetchOnWindowFocus: 'always',
  })
  const { data: people = [] } = useApiQuery<IdeaPerson[]>(['idea-people', key], ideaPath(key, 'people'), undefined, { enabled: canWrite })
  const labels = useMemo(() => new Map<number, IdeaLabel>((data?.labels ?? []).map((l) => [l.id, l])), [data])
  const [filter, setFilter] = useState<IdeaFilter>('all')
  // A label filter whose label was deleted shows everything again.
  const activeFilter: IdeaFilter = filter.startsWith('label:') && !labels.has(Number(filter.slice(6))) ? 'all' : filter

  const { lists, cards, source } = useMemo(() => {
    const lists = data?.lists ?? []
    const cards = new Map<string, { card: Face; list: IdeaListData }>()
    const source: ListContainer[] = lists.map((list) => {
      const own = list.cards ?? []
      own.forEach((card) => cards.set(cardKey(card.id), { card, list }))
      return { id: listKey(list.id), itemIds: own.filter((c) => cardShown(c, activeFilter, user?.id)).map((c) => cardKey(c.id)) }
    })
    return { lists, cards, source }
  }, [data, activeFilter, user?.id])

  // §4.5: a locked card or a card in a locked list doesn't move for a non-manager; nothing moves on a tablet.
  const isLocked = useCallback(
    (itemKey: string) => {
      const entry = cards.get(itemKey)
      if (!entry || isDevice) return true
      return !manage && (entry.card.locked || entry.list.locked)
    },
    [cards, isDevice, manage],
  )
  const listByKey = useCallback((containerId: string) => lists.find((l) => listKey(l.id) === containerId), [lists])
  const { containers, move } = useOptimisticLists(source, isLocked)

  const [toast, setToast] = useState<{ message: string; error?: boolean } | null>(null)
  const [archivedOpen, setArchivedOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [addingList, setAddingList] = useState(false)
  const [newList, setNewList] = useState('')
  const [picked, setPicked] = useState<number | null>(null)
  const selectedList = lists.find((l) => l.id === picked) ?? lists[0]

  const refresh = () => qc.invalidateQueries({ queryKey: [IDEA_BOARD_KEY, key] })
  const fail = (err: unknown) => setToast({ message: ideaError(err), error: true })

  /** Run a write; on failure say why; refetch either way. */
  const run = async (write: () => Promise<unknown>, done?: string) => {
    try {
      await write()
      if (done) setToast({ message: done })
      return true
    } catch (err) {
      fail(err)
      return false
    } finally {
      void refresh()
    }
  }

  // A non-manager can't move a card into a locked list; on a phone, cards
  // reach another list through its tab.
  const canMoveTo = (from: string, to: string) => {
    if (phone) return from === to
    const target = listByKey(to)
    return !!target && (manage || !target.locked)
  }

  const moveCard = (m: Move, toList?: number) => {
    const card = cards.get(m.itemId)?.card
    const list = toList ?? idOf(m.toContainer)
    if (!card) return
    const before = m.beforeId ? idOf(m.beforeId) : null
    move(m, () => api.post(ideaPath(key, 'cards', card.id, 'move'), { list_id: list, before_id: before }))
      .catch(fail)
      .finally(refresh)
  }

  /** Phone: a card dropped on another list's tab goes to the bottom of that list. */
  const dropOnList = (listId: number) => (itemKey: string) => {
    const from = containerOf(containers, itemKey)
    const target = lists.find((l) => l.id === listId)
    if (!from || !target || listKey(listId) === from) return
    if (target.locked && !manage) return setToast({ message: 'Locked by a manager', error: true })
    moveCard({ itemId: itemKey, fromContainer: from, toContainer: listKey(listId), beforeId: null }, listId)
  }

  const listAction = (list: IdeaListData, action: ListAction) => {
    const i = lists.indexOf(list)
    switch (action) {
      case 'left':
        return run(() => api.post(ideaPath(key, 'lists', list.id, 'move'), { before_id: lists[i - 1]?.id ?? null }))
      case 'right':
        return run(() => api.post(ideaPath(key, 'lists', list.id, 'move'), { before_id: lists[i + 2]?.id ?? null }))
      case 'lock':
        return run(() => api.post(ideaPath(key, 'lists', list.id, 'lock')), `Locked "${list.name}"`)
      case 'unlock':
        return run(() => api.post(ideaPath(key, 'lists', list.id, 'unlock')), `Unlocked "${list.name}"`)
      case 'archive':
        return run(() => api.post(ideaPath(key, 'lists', list.id, 'archive')), `Archived "${list.name}". It's in Archived in the board's menu.`)
    }
  }

  const addList = async () => {
    const name = newList.trim()
    if (!name) return setAddingList(false)
    const ok = await run(() => api.post(ideaPath(key, 'lists'), { name }))
    if (ok) setNewList('')
  }

  const openCard = (id: number) => navigate(`/ideas/${key}/cards/${id}`, { state: { fromBoard: true } })
  const closeCard = () => {
    // Opened from the board: back to it (Android back does the same). From a shared link: the board.
    if ((location.state as { fromBoard?: boolean } | null)?.fromBoard) navigate(-1)
    else navigate(`/ideas/${key}`, { replace: true })
  }

  const switchBoard = (next: string) => {
    writeIdeaBoard(next)
    navigate(`/ideas/${next}`)
  }

  const filters: Choice<IdeaFilter>[] = [
    { value: 'all', label: 'All' },
    ...(canWrite
      ? [
          { value: 'mine' as IdeaFilter, label: 'My cards' },
          { value: 'watching' as IdeaFilter, label: 'Watching' },
        ]
      : []),
  ]
  const labelFilters: Choice<IdeaFilter>[] = (data?.labels ?? []).map((l) => ({ value: `label:${l.id}` as IdeaFilter, label: l.name }))

  const renderContainer = (container: ListContainer, slot: ContainerSlot): ReactNode => {
    const list = listByKey(container.id)
    if (!list) return null
    const i = lists.indexOf(list)
    const canChange = canWrite && (manage || !list.locked)
    return (
      <IdeaListColumn
        key={list.id}
        list={list}
        slot={slot}
        shown={container.itemIds.length}
        total={list.cards?.length ?? 0}
        canChange={canChange}
        canAdd={canChange}
        canLock={manage}
        isFirst={i === 0}
        isLast={i === lists.length - 1}
        readOnly={isDevice}
        full={phone}
        onAction={(action) => void listAction(list, action)}
        onRename={(name) => run(() => api.patch(ideaPath(key, 'lists', list.id), { name }))}
        onAddCard={(title) => run(() => api.post(ideaPath(key, 'cards'), { list_id: list.id, title }))}
      />
    )
  }

  const addListColumn = canWrite && (
    <Box sx={{ width: phone ? '100%' : 280, flexShrink: 0 }}>
      {addingList ? (
        <Paper variant="outlined" sx={{ p: 1, bgcolor: 'background.boardColumn' }}>
          <TextField
            size="small"
            fullWidth
            autoFocus
            placeholder="List name"
            value={newList}
            onChange={(e) => setNewList(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void addList()
              if (e.key === 'Escape') setAddingList(false)
            }}
            slotProps={{ htmlInput: { maxLength: 80, 'aria-label': 'List name', 'data-testid': 'idea-add-list-input' } }}
          />
          <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
            <Button size="small" variant="contained" onClick={addList} data-testid="idea-add-list-save">
              Add list
            </Button>
            <Button size="small" onClick={() => setAddingList(false)}>
              Cancel
            </Button>
          </Box>
        </Paper>
      ) : (
        <Button variant="outlined" startIcon={<Add />} fullWidth onClick={() => setAddingList(true)} sx={{ justifyContent: 'flex-start' }} data-testid="idea-add-list">
          Add a list
        </Button>
      )}
    </Box>
  )

  const layout = (rendered: Record<string, ReactNode>) => {
    if (phone) {
      const current = selectedList
      return (
        <Box>
          <Tabs
            value={current ? current.id : false}
            onChange={(_, v: number) => setPicked(v)}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            sx={{ mb: 1, minHeight: 40 }}
            data-testid="idea-list-tabs"
          >
            {lists.map((l) => {
              const count = containers.find((c) => c.id === listKey(l.id))?.itemIds.length ?? 0
              return (
                <Tab
                  key={l.id}
                  value={l.id}
                  sx={{ minHeight: 40, py: 0, px: 0, textTransform: 'none', maxWidth: 220 }}
                  data-testid={`idea-list-tab-${l.id}`}
                  label={
                    <DropTarget id={`tab-${l.id}`} label={l.name} onDrop={dropOnList(l.id)}>
                      {({ isOver }) => (
                        <Box
                          sx={{
                            px: 1.5,
                            py: 1,
                            borderRadius: 1,
                            outline: isOver ? '2px dashed' : undefined,
                            outlineColor: 'primary.main',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.5,
                            maxWidth: 200,
                          }}
                        >
                          <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {l.name}
                          </Box>
                          <Box component="span" sx={{ flexShrink: 0 }}>
                            ({count})
                          </Box>
                        </Box>
                      )}
                    </DropTarget>
                  }
                />
              )
            })}
          </Tabs>
          {current && rendered[listKey(current.id)]}
          <Box sx={{ mt: 2 }}>{addListColumn}</Box>
        </Box>
      )
    }
    return (
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, overflowX: 'auto', pb: 2 }} data-testid="idea-lists">
        {lists.map((l) => rendered[listKey(l.id)])}
        {addListColumn}
      </Box>
    )
  }

  return (
    <Box data-testid="idea-board" data-board={key}>
      <PageTitle>
        <BoardSwitcher board={board} boards={boards} onSwitch={switchBoard} compact titleOf={ideaBoardTitle} />
      </PageTitle>
      <PageToolbar
        testid="idea-toolbar"
        end={
          <SettingsGear label="Board settings" testid="idea-settings" dot={activeFilter !== 'all'}>
            {(close) => (
              <>
                <SettingsChoices label="Show" options={[...filters, ...labelFilters]} value={activeFilter} onPick={setFilter} testid="idea-filter" />
                {canWrite && <Divider />}
                {canWrite && (
                  <MenuItem
                    onClick={() => {
                      close()
                      setArchivedOpen(true)
                    }}
                    data-testid="idea-menu-archived"
                  >
                    Archived
                  </MenuItem>
                )}
                {board.history && !isDevice && (
                  <MenuItem
                    onClick={() => {
                      close()
                      setHistoryOpen(true)
                    }}
                    data-testid="idea-menu-history"
                  >
                    History
                  </MenuItem>
                )}
              </>
            )}
          </SettingsGear>
        }
      >
        {activeFilter !== 'all' && (
          <Button size="small" onClick={() => setFilter('all')} data-testid="idea-filter-clear">
            Showing: {[...filters, ...labelFilters].find((f) => f.value === activeFilter)?.label} · Show all
          </Button>
        )}
      </PageToolbar>
      {isError && !data && <Alert severity="error">{ideaError(error)}</Alert>}
      {isLoading && !data && <CircularProgress />}
      {data && (
        <SortableLists
          containers={containers}
          onMove={(m) => moveCard(m)}
          isLocked={isLocked}
          canMoveTo={canMoveTo}
          itemLabel={(k) => cards.get(k)?.card.title ?? 'card'}
          containerLabel={(id) => listByKey(id)?.name ?? 'list'}
          onItemActivate={(k) => openCard(idOf(k))}
          renderItem={(k, state) => {
            const entry = cards.get(k)
            return entry ? (
              <IdeaCardFace
                card={entry.card}
                labels={labels}
                listLocked={entry.list.locked}
                today={today}
                dragging={state.dragging}
                overlay={state.overlay}
                onOpen={(c) => openCard(c.id)}
              />
            ) : null
          }}
          renderContainer={renderContainer}
        >
          {layout}
        </SortableLists>
      )}
      {cardId !== null && data && (
        <IdeaCardDialog
          key={cardId}
          board={board}
          cardId={cardId}
          lists={lists}
          labels={data.labels}
          people={people}
          onClose={closeCard}
          onChanged={refresh}
          onToast={(message) => setToast({ message })}
        />
      )}
      {archivedOpen && <ArchivedDialog board={board} onClose={() => setArchivedOpen(false)} onChanged={refresh} onOpenCard={openCard} />}
      {historyOpen && <IdeaHistoryDialog board={board} onClose={() => setHistoryOpen(false)} />}
      <Snackbar open={!!toast} autoHideDuration={toast?.error ? 6000 : 4000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {toast ? (
          <Alert severity={toast.error ? 'error' : 'success'} onClose={() => setToast(null)} variant="filled" data-testid="idea-toast">
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  )
}
