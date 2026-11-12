import { Navigate, useParams } from 'react-router-dom'
import useAuth from '../../hooks/useAuth'
import { boardUrl, ideaBoardTarget, parseCardId, readIdeaBoard } from '../../lib/ideas'
import IdeaBoard from './IdeaBoard'

/**
 * D53 §4.4: `/boards/:board` (and `/boards/:board/cards/:cardId`, a card open
 * on it) shows that board when the person can open it; otherwise their first
 * board (S227: `/boards/bar` → `/boards/brewery`; S238: → `/boards/company`),
 * or Home with none. D58 §3.9: a card id that can't be one goes to the board
 * with the not-found notice.
 */
export function IdeaBoardPage() {
  const { board: key = '', cardId } = useParams()
  const { ideaBoards } = useAuth()
  const board = ideaBoards.find((b) => b.key === key)
  const card = parseCardId(cardId)
  if (board && card === 'bad') return <Navigate to={boardUrl(board.key)} replace state={{ cardMissing: true }} />
  if (board) return <IdeaBoard key={board.key} board={board} boards={ideaBoards} cardId={card === 'bad' ? null : card} />
  const target = ideaBoardTarget(ideaBoards, key, null)
  return <Navigate to={target ? boardUrl(target) : '/'} replace />
}

/** `/boards`: the board this browser last opened, else the first. */
export function IdeasIndex() {
  const { ideaBoards } = useAuth()
  const target = ideaBoardTarget(ideaBoards, null, readIdeaBoard())
  return <Navigate to={target ? boardUrl(target) : '/'} replace />
}
