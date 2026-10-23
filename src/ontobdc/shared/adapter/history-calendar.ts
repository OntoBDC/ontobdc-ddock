import type { EntityGroup, EntityItem } from '@/ontobdc/shared/domain/model/entity';
import type { DayEntry } from '@/ontobdc/shared/domain/model/history';

/** How many months the history shows before and after the current one, until it knows the saved days. */
export const MONTHS_BEFORE = 3;
export const MONTHS_AFTER = 1;

export type Month = { year: number; month: number };

const ISO_DATE = /(\d{4})-(\d{2})-(\d{2})/;

const pad = (value: number, size = 2): string => String(value).padStart(size, '0');

/** The first number in a value such as `2025`, `--05` or `---21`. */
function numberIn(value: string | undefined): number | null {
  const found = /\d+/.exec(value ?? '');
  return found ? Number(found[0]) : null;
}

function valid(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * The day an entity stands for: its date when it has one, else the year, month and day of its date-time
 * description when it has them, otherwise the date written in its name. None when it says no valid date.
 */
export function dayOf(item: EntityItem): DayEntry | null {
  const field = (name: string): string | undefined => item.fields.find((candidate) => candidate.name === name)?.values[0];
  const stated = ISO_DATE.exec(field('date') ?? '');
  if (stated && valid(Number(stated[1]), Number(stated[2]), Number(stated[3]))) return { id: item.id, date: stated[0] };
  const year = numberIn(field('year'));
  const month = numberIn(field('month'));
  const day = numberIn(field('day'));
  if (year !== null && month !== null && day !== null && valid(year, month, day)) {
    return { id: item.id, date: `${pad(year, 4)}-${pad(month)}-${pad(day)}` };
  }
  const written = ISO_DATE.exec(item.name);
  if (written && valid(Number(written[1]), Number(written[2]), Number(written[3]))) {
    return { id: item.id, date: written[0] };
  }
  return null;
}

/** The days in the groups a `container --entity Day --list` answered; the first entity wins for a date. */
export function daysOf(groups: EntityGroup[]): DayEntry[] {
  const byDate = new Map<string, DayEntry>();
  for (const group of groups) {
    for (const item of group.items) {
      const day = dayOf(item);
      if (day && !byDate.has(day.date)) byDate.set(day.date, day);
    }
  }
  return [...byDate.values()];
}

const monthKey = (month: Month): number => month.year * 12 + month.month - 1;

/**
 * The months to show, in chronological order: the current one with the ones around it, and every
 * month that holds a saved day.
 */
export function monthsOf(now: Date, days: DayEntry[]): Month[] {
  const keys = new Set<number>();
  const current = monthKey({ year: now.getFullYear(), month: now.getMonth() + 1 });
  for (let offset = -MONTHS_BEFORE; offset <= MONTHS_AFTER; offset += 1) keys.add(current + offset);
  for (const day of days) keys.add(monthKey({ year: Number(day.date.slice(0, 4)), month: Number(day.date.slice(5, 7)) }));
  return [...keys].sort((a, b) => a - b).map((key) => ({ year: Math.floor(key / 12), month: (key % 12) + 1 }));
}

/**
 * One month as a table of weeks, Sunday first. The days with an entity are buttons that call
 * `open`; the others are plain numbers.
 */
export function monthElement(
  month: Month,
  saved: Map<string, DayEntry>,
  locale: string,
  open: (day: DayEntry) => void,
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'history-month';
  section.dataset.month = `${pad(month.year, 4)}-${pad(month.month)}`;

  const title = document.createElement('h4');
  title.className = 'history-month-title';
  // Only the first letter is a capital: the "de" between the month and the year stays as the language writes it.
  const label = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(month.year, month.month - 1, 1)));
  title.textContent = label.charAt(0).toLocaleUpperCase(locale) + label.slice(1);
  const today = new Date();
  if (month.year === today.getFullYear() && month.month === today.getMonth() + 1) section.classList.add('current');
  section.appendChild(title);

  const grid = document.createElement('div');
  grid.className = 'history-grid';
  grid.setAttribute('role', 'grid');

  // 2023-01-01 was a Sunday.
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' });
  for (let index = 0; index < 7; index += 1) {
    const head = document.createElement('span');
    head.className = 'history-weekday';
    head.textContent = weekday.format(new Date(Date.UTC(2023, 0, 1 + index)));
    grid.appendChild(head);
  }

  const blanks = new Date(Date.UTC(month.year, month.month - 1, 1)).getUTCDay();
  for (let index = 0; index < blanks; index += 1) grid.appendChild(document.createElement('span'));

  const length = new Date(Date.UTC(month.year, month.month, 0)).getUTCDate();
  for (let number = 1; number <= length; number += 1) {
    const entry = saved.get(`${pad(month.year, 4)}-${pad(month.month)}-${pad(number)}`);
    if (entry) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'history-day saved';
      button.textContent = String(number);
      button.addEventListener('click', () => open(entry));
      grid.appendChild(button);
    } else {
      const plain = document.createElement('span');
      plain.className = 'history-day';
      plain.textContent = String(number);
      grid.appendChild(plain);
    }
  }
  section.appendChild(grid);
  return section;
}
