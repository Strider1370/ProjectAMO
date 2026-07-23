export function mergePollingData(previousData = {}, changedData = {}) {
  const availableData = {}
  for (const [key, value] of Object.entries(changedData)) {
    if (value === undefined) continue
    availableData[key] = value
  }
  return { ...previousData, ...availableData }
}

export function hasIncompletePollingData(changedData = {}) {
  return Object.values(changedData).some((value) => value === undefined)
}
