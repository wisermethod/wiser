// Writes an event's start, and its end when set, in the event's own time zone.

const dateFormat = { weekday: "long", year: "numeric", month: "long", day: "numeric" };
const timeFormat = { hour: "numeric", minute: "2-digit", timeZoneName: "short" };
const dayFormat = { year: "numeric", month: "2-digit", day: "2-digit" };

function parts(instant, timeZone, options) {
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone }).format(instant);
}

export function formatEventWhen(startValue, endValue, timeZone) {
  const start = new Date(startValue);
  const date = parts(start, timeZone, dateFormat);
  const time = parts(start, timeZone, timeFormat);
  if (!endValue) return `${date}, ${time}`;
  const end = new Date(endValue);
  const endTime = parts(end, timeZone, timeFormat);
  if (parts(start, timeZone, dayFormat) === parts(end, timeZone, dayFormat)) return `${date}, ${time} to ${endTime}`;
  return `${date}, ${time} to ${parts(end, timeZone, dateFormat)}, ${endTime}`;
}
