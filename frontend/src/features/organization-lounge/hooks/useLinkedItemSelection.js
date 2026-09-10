import { useCallback, useEffect, useRef, useState } from 'react'
import {
  activeLinkedSelection,
  linkedItemKey,
  nextPinnedSelection,
  shouldResetLinkedSelection,
} from '../lib/linkedSelection.js'

export default function useLinkedItemSelection({
  flightId = null,
  selectedItemId = null,
  onSelectItem,
} = {}) {
  const [previewItemId, setPreviewItemId] = useState(null)
  const previousFlightIdRef = useRef(flightId)

  useEffect(() => {
    if (shouldResetLinkedSelection(previousFlightIdRef.current, flightId)) {
      setPreviewItemId(null)
      onSelectItem?.(null)
    }
    previousFlightIdRef.current = flightId
  }, [flightId, onSelectItem])

  const preview = useCallback((item) => setPreviewItemId(linkedItemKey(item)), [])
  const clearPreview = useCallback(() => setPreviewItemId(null), [])
  const pin = useCallback((item) => {
    setPreviewItemId(null)
    onSelectItem?.(nextPinnedSelection(selectedItemId, item))
  }, [onSelectItem, selectedItemId])
  const clear = useCallback(() => {
    setPreviewItemId(null)
    onSelectItem?.(null)
  }, [onSelectItem])

  return {
    activeItemId: activeLinkedSelection(previewItemId, selectedItemId),
    pinnedItemId: linkedItemKey(selectedItemId),
    previewItemId,
    preview,
    clearPreview,
    pin,
    clear,
  }
}
