/** A day saved in the container: `date` is `YYYY-MM-DD`, `id` the global id of its entity. */
export type DayEntry = { id: string; date: string };

/** The type of a day, for the entity the person creates from the history. */
export const DAY_ENTITY_TYPE = 'http://datacenter.app.br/ontology/domain/calendar/taxonomy/type.ttl#Day';

/** Today, as the `YYYY-MM-DD` a date field takes: the day a new day starts with. */
export function todayAsDate(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
