// Times are built in UTC; this shows them in the reader's own zone.
const dateTime = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZoneName: "short",
});
const timeOnly = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", timeZoneName: "short" });

export function localiseTimes() {
  document.querySelectorAll<HTMLTimeElement>("time[data-local]").forEach((t) => {
    const d = new Date(t.dateTime);
    t.textContent = (t.dataset.local === "time" ? timeOnly : dateTime).format(d);
    t.title = `${d.toISOString().replace("T", " ").slice(0, 16)} UTC`;
  });
}

localiseTimes();
