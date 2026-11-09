import { entityLabels, isEntityReference } from '@/ontobdc/shared/adapter/entity-references';
import { keepApplied, nameIn, panelAndFacade, type FacadeField } from '@/ontobdc/shared/adapter/facade-labels';
import type { CapabilityContext, CapabilityMetadata } from '@/ontobdc/shared/domain/model/capability';

/** Per entity panel: what stops the names from being kept, replaced when the tab is set up again. */
const watching = new WeakMap<HTMLElement, () => void>();

/**
 * Shows the fields whose values are the subclasses of a class (the type of an
 * annotation, for instance) with the name of the subclass in the language of
 * the interface, instead of its identifier. The names are the ones the facade
 * gives the options (`option_labels`); a value with no name in the language, or
 * that is not one of the options, is left as it was drawn. The identifier drawn
 * is kept on the element, so the name is always taken from the value and never
 * from a name already shown.
 */
export class EntitySubclassesResolvedCapability {
  static readonly METADATA: CapabilityMetadata = {
    id: 'org.ontobdc.web.plugin.capability.transformation.target.entity_subclasses_resolved',
    description: 'Show the fields whose values are subclasses of a class with the name of the subclass in the current language.',
  };

  async execute(context: CapabilityContext): Promise<void> {
    const { panel, facade } = panelAndFacade(context);
    // The fields that are named: the ones of entities (by the entities of the container) and the ones with option names.
    const named = new Map(
      facade.fields
        .filter((field) => isEntityReference(field) || Object.keys(field.option_labels ?? {}).length > 0)
        .map((field): [string, FacadeField] => [field.identifier, field]),
    );

    await keepApplied(panel, watching, (locale) => {
      // The entities of the container are named too: a field of entities holds the global id of one. They are read each
      // time the fields are drawn, since an entity made after the tab was set up (a framework, from its field) has a name too.
      const entities = entityLabels();
      for (const term of panel.querySelectorAll<HTMLElement>('.entity-fields dt[data-field]')) {
        const field = named.get(term.dataset.field ?? '');
        const labels = field ? (isEntityReference(field) ? entities : (field.option_labels ?? {})) : undefined;
        const detail = term.nextElementSibling as HTMLElement | null;
        if (!labels || !detail || detail.classList.contains('entity-empty') || detail.dataset.visualized === 'true') continue;

        const items = [...detail.querySelectorAll<HTMLElement>('li')];
        for (const element of items.length > 0 ? items : [detail]) {
          element.dataset.subclass ??= element.textContent ?? '';
          element.textContent = nameIn(labels[element.dataset.subclass], locale) ?? element.dataset.subclass;
        }
      }
    });

    context.etl.write('set_up_entity_facade', context.requestId, context.state, {
      phase: 'done',
      entity: { id: context.parameters.id, panelId: context.parameters.panelId },
      result: { fields: [...named.keys()] },
    });
  }
}
