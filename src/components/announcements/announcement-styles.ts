export function announcementToneClass(severity: string) {
  if (severity === 'critical') {
    return 'border-red-500/30 bg-red-500/10 text-red-100'
  }
  if (severity === 'warning') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-100'
  }
  return 'border-sky-500/30 bg-sky-500/10 text-sky-100'
}

