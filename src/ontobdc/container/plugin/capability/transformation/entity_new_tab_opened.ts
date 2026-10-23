import { eventBus } from '@/ontobdc/shared/adapter/event-bus';
import { nameIn, type Facade } from '@/ontobdc/shared/adapter/facade-labels';
import type { CapabilityContext, CapabilityMetadata } from '@/ontobdc/shared/domain/model/capability';
import { getLocale, translate } from '@/ontobdc/shared/plugin/i18n';

/** Asks the surface for the tab `entity-new:<group>`, which shows the fields to fill in; asking again focuses it. */
export class EntityNewTabOpenedCapability {
  static readonly METADATA: CapabilityMetadata = {
    id: 'org.ontobdc.container.plugin.capability.transformation.target.entity_new_tab_opened',
    description: 'Open the tab where the new entity is filled in.',
  };

  /** Nothing tells beforehand that this state already holds. */
  async isSatisfied(): Promise<boolean> {
    return false;
  }

  async execute(context: CapabilityContext): Promise<void> {
    if (!context.machine) throw new Error('The context of the capability carries no machine.');
    const found = context.etl.read(context.machine, context.requestId, 'entity_new_facade_found')?.result as { facade?: Facade; group?: string } | undefined;
    if (!found?.facade || !found.group) throw new Error('No state found the facade of the entity.');

    eventBus.publish('presentation.main.panel.open.requested', 'entity_new_tab_opened', {
      container: 'surface',
      id: `entity-new:${found.group}`,
      component: 'entity_new',
      title: translate('database.new.title', { name: nameIn(found.facade.labels, getLocale()) ?? found.facade.name ?? found.group }),
    });
  }
}
