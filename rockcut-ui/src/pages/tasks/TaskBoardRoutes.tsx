import { Navigate, useLocation, useParams } from 'react-router-dom'
import useAuth from '../../hooks/useAuth'
import { ALL_BOARDS, boardTarget, readBoard } from '../../lib/tasks'
import AllBoard from './AllBoard'
import TaskBoard from './TaskBoard'

/**
 * D41 §3.5: `/tasks/:dept` shows that board when the person can open it;
 * otherwise their first board, or Home with none (S102, S109, S114). The
 * range (`?from=&to=`) comes along. `/tasks/all` is the All departments view
 * for owners (§3.6); anyone else goes to their first board.
 * D52 (task 4318): a board's name works as well as its key, so `/tasks/taproom`
 * opens the Taproom board (key `bar` since D32's rename) instead of another one.
 */
export function TaskBoardPage() {
  const { dept = '' } = useParams()
  const { search } = useLocation()
  const { taskBoards } = useAuth()
  const board = taskBoards.find((b) => b.key === dept)
  const byName = board ? undefined : taskBoards.find((b) => b.key !== ALL_BOARDS && slug(b.name) === slug(dept))
  if (byName) return <Navigate to={`/tasks/${byName.key}${search}`} replace />
  if (board?.key === ALL_BOARDS) return <AllBoard board={board} boards={taskBoards} />
  if (board) return <TaskBoard key={board.key} board={board} boards={taskBoards} />
  const target = boardTarget(taskBoards, dept, null)
  return <Navigate to={target ? `/tasks/${target}${search}` : '/'} replace />
}

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')

/** `/tasks`: the board this browser last opened, else the first. */
export function TasksIndex() {
  const { search } = useLocation()
  const { taskBoards } = useAuth()
  const target = boardTarget(taskBoards, null, readBoard())
  return <Navigate to={target ? `/tasks/${target}${search}` : '/'} replace />
}

/**
 * D41: the board moved from /brewery/tasks to /tasks/brewery. Old bookmarks
 * and the installed PWA's history land there, with their range (?from=&to=),
 * and from there on the person's own board if the Brewery's isn't theirs.
 */
export function OldTaskBoardRedirect() {
  const { search } = useLocation()
  return <Navigate to={`/tasks/brewery${search}`} replace />
}
