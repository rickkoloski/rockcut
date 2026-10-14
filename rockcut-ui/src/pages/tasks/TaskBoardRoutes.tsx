import { Navigate, useLocation, useParams } from 'react-router-dom'
import useAuth from '../../hooks/useAuth'
import { boardTarget, readBoard } from '../../lib/tasks'
import TaskBoard from './TaskBoard'

/**
 * D41 §3.5: `/tasks/:dept` shows that board when the person can open it;
 * otherwise their first board, or Home with none (S102, S109, S114). The
 * range (`?from=&to=`) comes along.
 */
export function TaskBoardPage() {
  const { dept = '' } = useParams()
  const { search } = useLocation()
  const { taskBoards } = useAuth()
  const board = taskBoards.find((b) => b.key === dept)
  if (board) return <TaskBoard key={board.key} board={board} boards={taskBoards} />
  const target = boardTarget(taskBoards, dept, null)
  return <Navigate to={target ? `/tasks/${target}${search}` : '/'} replace />
}

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
