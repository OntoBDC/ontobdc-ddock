import type { en } from './en';

export default {
  'notice.annotations.delete.failed': 'No se pudo eliminar la anotación: {message}',
  'notice.annotations.export.failed': 'No se pudieron exportar las anotaciones: {message}',
  'annotations.filter.hideClosed': 'Ocultar anotaciones cerradas',
  'annotations.filter.showClosed': 'Mostrar anotaciones cerradas',
  'annotations.filter.allClosed': 'Todas las anotaciones están cerradas.',
} satisfies Record<keyof typeof en, string>;
