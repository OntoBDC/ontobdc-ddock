import type { en } from './en';

export default {
  'notice.annotations.delete.failed': 'Não foi possível excluir a anotação: {message}',
  'notice.annotations.export.failed': 'Não foi possível exportar as anotações: {message}',
  'annotations.filter.hideClosed': 'Ocultar anotações fechadas',
  'annotations.filter.showClosed': 'Mostrar anotações fechadas',
  'annotations.filter.allClosed': 'Todas as anotações estão fechadas.',
} satisfies Record<keyof typeof en, string>;
