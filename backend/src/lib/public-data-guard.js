// The public weather tree shares a disk with application persistence. Membership,
// sessions and backups must never bypass API authorization through express.static.
export function publicDataGuard(req, res, next) {
  let pathname
  try { pathname = decodeURIComponent(req.path).replaceAll('\\', '/') }
  catch { return res.status(400).end() }
  if (/(?:^|\/)(?:backups|organization-files)(?:\/|$)/i.test(pathname)
    || /\.(?:db|sqlite|sqlite3)(?:-(?:wal|shm|journal))?$/i.test(pathname)) {
    return res.status(404).end()
  }
  next()
}
