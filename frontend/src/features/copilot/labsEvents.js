export const LABS_CHANGED = 'amo-copilot-labs-changed'
export function notifyLabsChanged() {
  window.dispatchEvent(new Event(LABS_CHANGED))
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(LABS_CHANGED)
    channel.postMessage('changed') // Never transmit credentials or account data.
    channel.close()
  }
}
