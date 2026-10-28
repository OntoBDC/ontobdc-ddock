import type { Editor, EditorOptions } from '@/ontobdc/shared/adapter/editor/editor';
import { EntityRepository } from '@/ontobdc/shared/adapter/entity-repository';
import { eventBus } from '@/ontobdc/shared/adapter/event-bus';
import { visualizationFor } from '@/ontobdc/shared/adapter/visualization_by_iri';
import type { VisualizationResult } from '@/ontobdc/shared/domain/model/visualization';
import { translate } from '@/ontobdc/shared/plugin/i18n';

const SOURCE = 'geometry_editor';

/** The visualization the geometries are shown with, in the tab and here: the document with them drawn on it. */
const VISUALIZATION = 'http://datacenter.app.br/ontology/tool/ontobdc/facade/ns.ttl#GeometryOverlay';

/**
 * Edits the geometries of an entity, which are not typed in: it shows them as the tab does (the document with the geometries
 * drawn on it) and has a button that asks for them to be drawn, `presentation.entity.geometry.draw.requested`. What is
 * drawn is kept by the one that draws it, as it is drawn, so what the editor holds never changes: it has no say in the
 * Save. A new entity has nothing to draw on yet, and the button says so.
 */
export default function geometryEditor({ value, label, owner = '', field = '' }: EditorOptions): Editor {
  const root = document.createElement('div');
  root.className = 'entity-geometry-editor';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', label);
  const shown = document.createElement('div');
  shown.className = 'entity-geometry-shown';
  const draw = document.createElement('button');
  draw.type = 'button';
  draw.className = 'entity-list-add';
  draw.textContent = '✎';
  const isNew = owner.startsWith('new:');
  draw.title = translate(isNew ? 'entity.geometry.saveFirst' : 'entity.geometry.draw');
  draw.setAttribute('aria-label', draw.title);
  draw.disabled = isNew;
  root.append(shown, draw);

  let visualization: VisualizationResult | null = null;
  let drawing = 0;
  const show = (): void => {
    visualization?.dispose();
    visualization = null;
    const mine = ++drawing;
    const values = EntityRepository.getInstance().find(owner)?.item.fields.find((candidate) => candidate.name === field)?.values ?? (value ? [value] : []);
    if (values.length === 0) {
      const none = document.createElement('span');
      none.className = 'entity-empty';
      none.textContent = '—';
      shown.replaceChildren(none);
      return;
    }
    void visualizationFor(VISUALIZATION).then((draws) => {
      // A later drawing took this one's place while the visualization loaded.
      if (!draws || mine !== drawing) return;
      visualization = draws({ values, accepts: { mime_types: [], extensions: [] }, entityId: owner });
      shown.replaceChildren(visualization.element);
    });
  };
  show();
  // The entity is read again when what draws it has kept a geometry: what is shown follows it.
  let stale = false;
  // The editor is made before the tab puts it in the page: what is read in between is for it too, and it only lets go once it was in the page and left it.
  let mounted = false;
  const unsubscribe = eventBus.subscribe('presentation.container.entity.found', () => {
    if (root.isConnected) mounted = true;
    else if (mounted) { unsubscribe(); return; }
    stale = true;
    window.setTimeout(show, 0);
  });
  draw.addEventListener('click', () => eventBus.publish('presentation.entity.geometry.draw.requested', SOURCE, { owner, field }));

  return {
    element: root,
    value: () => value,
    isValid: () => true,
    onChange: () => undefined,
    stale: () => stale,
  };
}
