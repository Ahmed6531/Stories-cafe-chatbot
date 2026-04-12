const BEIRUT_TIME_ZONE = "Asia/Beirut"

export function formatBeirutDate(value) {
  if (!value) return "-"

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: BEIRUT_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date)
}

export function formatBeirutDateTime(value) {
  if (!value) return "-"

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: BEIRUT_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date)
}

