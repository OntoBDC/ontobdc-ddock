/**
 * The words of the Annotations addon, in English. The core reads every
 * plugin/i18n/locale file of the addons, by the name of the file, and the keys
 * below are added to the message keys of the application.
 */
export const en = {
  'notice.annotations.delete.failed': 'Could not delete the annotation: {message}',
  'notice.annotations.export.failed': 'Could not export the annotations: {message}',
  'annotations.filter.hideClosed': 'Hide closed annotations',
  'annotations.filter.showClosed': 'Show closed annotations',
  'annotations.filter.allClosed': 'All the annotations are closed.',
};

declare module '@/ontobdc/shared/plugin/i18n' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AddonMessages extends Record<keyof typeof en, string> {}
}

export default en;
