export function zonedDateTimeToIso(value: string, timeZone: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const parts = [yearText, monthText, dayText, hourText, minuteText].map(Number);
  const [year, month, day, hour, minute] = parts;
  const targetWallTime = Date.UTC(year, month - 1, day, hour, minute);
  if (new Date(targetWallTime).getUTCFullYear() !== year
    || new Date(targetWallTime).getUTCMonth() !== month - 1
    || new Date(targetWallTime).getUTCDate() !== day
    || hour > 23 || minute > 59) return null;

  let candidate = targetWallTime;
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    });
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const localParts = Object.fromEntries(formatter.formatToParts(candidate).map(part => [part.type, part.value]));
      const representedWallTime = Date.UTC(
        Number(localParts['year']), Number(localParts['month']) - 1, Number(localParts['day']),
        Number(localParts['hour']), Number(localParts['minute']), Number(localParts['second'])
      );
      const correction = targetWallTime - representedWallTime;
      if (correction === 0) return new Date(candidate).toISOString();
      candidate += correction;
    }
  } catch {
    return null;
  }
  // A local time skipped by a daylight-saving transition has no matching instant.
  return null;
}

export function tomorrowAtNoonInZone(timeZone: string, daysAhead = 1): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map(part => [part.type, part.value]));
  const tomorrow = new Date(Date.UTC(Number(parts['year']), Number(parts['month']) - 1, Number(parts['day']) + daysAhead));
  return `${tomorrow.toISOString().slice(0, 10)}T12:00`;
}
