import { watchCommand } from '@/ontobdc/shared/adapter/command-pending';
import { eventBus } from '@/ontobdc/shared/adapter/event-bus';
import { monthElement, monthsOf } from '@/ontobdc/shared/adapter/history-calendar';
import { HISTORY_DAYS_COMMAND } from '@/ontobdc/shared/domain/model/container-command';
import type { DayEntry } from '@/ontobdc/shared/domain/model/history';
import { getLocale, onLocaleChange } from '@/ontobdc/shared/plugin/i18n';

/** What the last `presentation.container.days.found` said, kept for a view that mounts after it. */
let knownDays: DayEntry[] = [];
let reading = false;
let tracking = false;
const views = new Set<() => void>();

function track(): void {
  if (tracking) return;
  tracking = true;
  eventBus.subscribe('presentation.container.days.found', ({ payload }) => {
    knownDays = Array.isArray(payload?.days) ? payload.days : [];
    views.forEach((draw) => draw());
  });
  watchCommand((command) => command === HISTORY_DAYS_COMMAND, (value) => {
    reading = value;
    views.forEach((draw) => draw());
  });
}

/**
 * The monthly calendars of the history: the months around the current one and the ones that hold a
 * saved day, which are the numbers that can be clicked to open the day. The explorer and the productivity
 * panel show the same view, each with its own element; the days are the ones found last.
 */
export function createHistoryView(source: string): { element: HTMLElement; dispose: () => void } {
  track();
  const element = document.createElement('div');
  element.className = 'history-calendars';

  const draw = (): void => {
    element.setAttribute('aria-busy', String(reading));
    const saved = new Map(knownDays.map((day) => [day.date, day]));
    element.replaceChildren(...monthsOf(new Date(), knownDays).map((month) =>
      monthElement(month, saved, getLocale(), (day) => eventBus.publish('presentation.database.item.opened', source, { group: 'history', id: day.id }))));
  };
  views.add(draw);
  const stopLocale = onLocaleChange(draw);
  draw();

  return {
    element,
    dispose: () => {
      views.delete(draw);
      stopLocale();
    },
  };
}
