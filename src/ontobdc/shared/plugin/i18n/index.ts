import { en, type MessageKey as CoreMessageKey, type Messages } from './locale/en';
import { eventBus } from '@/ontobdc/shared/adapter/event-bus';

/** Locale codes come from the translation file names, such as pt-BR.ts. */
export type Locale = string;

/**
 * The messages the addons add to the application. An addon declares its keys by
 * extending this interface from its own locale file (declaration merging), so
 * the core does not list them.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AddonMessages {}

export type MessageKey = CoreMessageKey | keyof AddonMessages;

export const DEFAULT_LOCALE: Locale = 'en';

const STORAGE_KEY = 'ontobdc.locale';

/** Vite discovers these modules during development and includes them in the build. */
const localeMessages = import.meta.glob<Partial<Messages>>('./locale/*.ts', {
  eager: true,
  import: 'default',
});

const dictionaries: Record<Locale, Partial<Messages>> = Object.fromEntries(
  Object.entries(localeMessages).map(([filePath, messages]) => [
    filePath.slice('./locale/'.length, -'.ts'.length),
    messages,
  ]),
);

/** The locale files of the addons, discovered like the ones above; a locale an addon has and the core does not is not offered. */
const addonLocaleMessages = import.meta.glob<Record<string, string>>('@/addon/*/plugin/i18n/locale/*.ts', {
  eager: true,
  import: 'default',
});

const addonDictionaries: Record<Locale, Record<string, string>> = {};
for (const [filePath, messages] of Object.entries(addonLocaleMessages)) {
  const locale = filePath.slice(filePath.lastIndexOf('/') + 1, -'.ts'.length);
  addonDictionaries[locale] = { ...addonDictionaries[locale], ...messages };
}

export const SUPPORTED_LOCALES: readonly Locale[] = Object.keys(dictionaries);

function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && SUPPORTED_LOCALES.includes(value);
}

function matchLocale(tag: string): Locale | null {
  const normalizedTag = tag.toLowerCase();
  const exact = SUPPORTED_LOCALES.find((locale) => locale.toLowerCase() === normalizedTag);
  if (exact) return exact;
  const base = normalizedTag.split('-')[0];
  return SUPPORTED_LOCALES.find((locale) => locale.toLowerCase() === base)
    ?? SUPPORTED_LOCALES.find((locale) => locale.toLowerCase().split('-')[0] === base)
    ?? null;
}

function detectLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch { /* storage unavailable */ }
  for (const tag of navigator.languages ?? [navigator.language]) {
    const match = matchLocale(tag);
    if (match) return match;
  }
  return DEFAULT_LOCALE;
}

let current: Locale = detectLocale();
document.documentElement.lang = current;

export function getLocale(): Locale {
  return current;
}

export function setLocale(locale: Locale): void {
  if (!isLocale(locale)) throw new Error(`Unsupported locale: ${locale}`);
  if (locale === current) return;
  current = locale;
  document.documentElement.lang = locale;
  document.title = translate('app.title');
  try { localStorage.setItem(STORAGE_KEY, locale); } catch { /* storage unavailable */ }
  eventBus.publish('presentation.main.locale.changed', 'i18n', { locale });
}

/** The message of the key in the locale: the core's, else the addons'. */
function messageOf(locale: Locale, key: MessageKey): string | undefined {
  const core: Partial<Record<string, string>> = locale === DEFAULT_LOCALE ? en : dictionaries[locale] ?? {};
  return core[key] ?? addonDictionaries[locale]?.[key];
}

export function translate(key: MessageKey, params?: Record<string, string | number>): string {
  const template = messageOf(current, key) ?? messageOf(DEFAULT_LOCALE, key) ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

export function onLocaleChange(handler: (locale: Locale) => void): () => void {
  return eventBus.subscribe('presentation.main.locale.changed', (event) => {
    if (event.payload) handler(event.payload.locale);
  });
}

export function timeFormatter(): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(current, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

const ATTRIBUTE_BINDINGS: Array<[string, string]> = [
  ['data-i18n-title', 'title'],
  ['data-i18n-aria-label', 'aria-label'],
  ['data-i18n-placeholder', 'placeholder'],
];

/** Fills every `data-i18n*` element under `root` with the active locale. */
export function applyTranslations(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.textContent = translate(el.dataset.i18n as MessageKey);
  });
  for (const [dataAttr, attr] of ATTRIBUTE_BINDINGS) {
    root.querySelectorAll<HTMLElement>(`[${dataAttr}]`).forEach((el) => {
      el.setAttribute(attr, translate(el.getAttribute(dataAttr) as MessageKey));
    });
  }
}

document.title = translate('app.title');
