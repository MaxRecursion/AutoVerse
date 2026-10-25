/**
 * Decoupled "open the search palette" signal, so any page (e.g. a not-found
 * state) can open the header's palette — optionally pre-filled — without
 * importing it or sharing React state.
 */
export const OPEN_SEARCH_EVENT = 'autoverse:open-search'

export interface OpenSearchDetail {
  query?: string
}

export function openSearch(query?: string): void {
  window.dispatchEvent(new CustomEvent<OpenSearchDetail>(OPEN_SEARCH_EVENT, { detail: { query } }))
}
