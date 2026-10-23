import { documentTitle } from '@/ontobdc/shared/adapter/document-iri';
import { EntityRepository } from '@/ontobdc/shared/adapter/entity-repository';
import { eventBus } from '@/ontobdc/shared/adapter/event-bus';
import { clearPending, keepApplied, panelAndFacade, type FacadeField } from '@/ontobdc/shared/adapter/facade-labels';
import { visualizationFor, type Visualization } from '@/ontobdc/shared/adapter/visualization_by_iri';
import type { CapabilityContext, CapabilityMetadata } from '@/ontobdc/shared/domain/model/capability';

/** Per entity panel: what stops the visualizations from being kept, replaced when the tab is set up again. */
const watching = new WeakMap<HTMLElement, () => void>();
/** Per entity panel: frees what the visualizations drawn hold. */
const drawn = new WeakMap<HTMLElement, Array<() => void>>();
/** Per entity panel: the place beside the fields where the visualizations that ask for it are drawn. */
const asides = new WeakMap<HTMLElement, HTMLElement>();
/** Per entity panel: stops waiting for the tab to close. */
const closing = new WeakMap<HTMLElement, () => void>();

const SEPARATOR = '|';

/**
 * Draws the fields whose facade asks for an alternative visualization (such as
 * an image carousel) with it, in place of their text. The values of the field
 * come from the entity, not from the page. A visualization that shows none of
 * the values is not drawn; a value it does not show stays below it, by its
 * title, so nothing is lost. The visualization is drawn again when the tab draws its fields again, and freed when the tab
 * closes. A visualization the table does not know leaves the field as text.
 */
export class EntityVisualizationsResolvedCapability {
  static readonly METADATA: CapabilityMetadata = {
    id: 'org.ontobdc.web.plugin.capability.transformation.target.entity_visualizations_resolved',
    description: 'Draw the fields that ask for an alternative visualization with it, in place of their text.',
  };

  async execute(context: CapabilityContext): Promise<void> {
    const { panel, facade } = panelAndFacade(context);
    const id = context.parameters.id as string;

    const requested = new Map<string, { field: FacadeField; draw: Visualization }>();
    for (const field of facade.fields) {
      const draw = await visualizationFor(field.alternative_visualization?.iri);
      if (draw) requested.set(field.identifier, { field, draw });
    }

    const free = (): void => {
      drawn.get(panel)?.forEach((dispose) => dispose());
      drawn.set(panel, []);
    };
    closing.get(panel)?.();
    const unsubscribe = eventBus.subscribe('presentation.main.entity.closed', ({ payload }) => {
      if (payload?.id !== id) return;
      free();
      unsubscribe();
      closing.delete(panel);
    });
    closing.set(panel, unsubscribe);

    await keepApplied(panel, watching, () => {
      free();
      asides.get(panel)?.remove();
      asides.delete(panel);
      const item = EntityRepository.getInstance().find(id)?.item;
      for (const term of panel.querySelectorAll<HTMLElement>('.entity-fields dt[data-field]')) {
        const found = requested.get(term.dataset.field ?? '');
        const detail = term.nextElementSibling as HTMLElement | null;
        if (!found || !detail) continue;

        const stored = item?.fields.find((candidate) => candidate.name === found.field.identifier)?.values ?? [];
        const values = (found.field.multivalued === true ? stored.flatMap((text) => text.split(SEPARATOR)) : stored)
          .map((text) => text.trim())
          .filter(Boolean);
        const visualization = found.draw({ values, accepts: found.field.alternative_visualization!.accepts, entityId: id });
        // A visualization that shows none of the values (a carousel with no image among the files) is not drawn: the field stays as text.
        if (visualization.handled.length === 0 && !visualization.aside) {
          visualization.dispose();
          continue;
        }
        drawn.get(panel)!.push(visualization.dispose);
        if (visualization.aside) {
          // Beside the fields, at the right: the row of the field is not drawn.
          let aside = asides.get(panel);
          if (!aside) {
            aside = document.createElement('aside');
            aside.className = 'entity-aside';
            panel.querySelector('.annotation-actions')?.after(aside);
            asides.set(panel, aside);
          }
          aside.append(visualization.element);
          term.hidden = true;
          detail.hidden = true;
          // The tab changes it through the visualization, and not with the editors of its fields.
          term.removeAttribute('data-editable');
          continue;
        }
        const rest = values.filter((value) => !visualization.handled.includes(value));
        const parts: HTMLElement[] = [visualization.element];
        if (rest.length > 0) {
          const list = document.createElement('ul');
          list.append(...rest.map((value) => {
            const entry = document.createElement('li');
            entry.textContent = documentTitle(value) ?? value;
            entry.title = value;
            return entry;
          }));
          parts.push(list);
        }
        detail.replaceChildren(...parts);
      }
    });

    clearPending(panel, requested.keys());

    context.etl.write('set_up_entity_facade', context.requestId, context.state, {
      phase: 'done',
      entity: { id, panelId: context.parameters.panelId },
      result: { fields: [...requested.keys()] },
    });
  }
}
