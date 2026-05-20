function fmtShort(iso) {
  const [, m, d] = iso.split('-')
  return `${d}.${m}`
}

export function voteDateRangeLabel(dates) {
  if (!dates || !dates.length) return null
  const minDate = dates.reduce((a, b) => (a < b ? a : b), dates[0])
  const maxDate = dates.reduce((a, b) => (a > b ? a : b), dates[0])
  return minDate === maxDate ? fmtShort(minDate) : `${fmtShort(minDate)}–${fmtShort(maxDate)}`
}
