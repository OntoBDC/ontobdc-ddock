import type { AppEvent } from '@/ontobdc/shared/adapter/event-bus';
import type { AppEventMap } from '@/ontobdc/shared/domain/model/event';
import type { ListenerMetadata } from '@/ontobdc/shared/domain/model/listener';
import { EntityFacadeUnavailableError } from '@/ontobdc/shared/domain/exception/entity-facade-unavailable';
import { clearPending } from '@/ontobdc/shared/adapter/facade-labels';
import { SetUpEntityFacadeMachine } from '@/ontobdc/web/plugin/machine/set_up_entity_facade/machine';

const ENTITY_OPENED = 'presentation.main.panel.entity.opened';

export class OnPanelEntityOpened {
  static readonly METADATA: ListenerMetadata = {
    id: 'web_on_panel_entity_opened',
    logical_component: 'web',
    description: 'Starts entity facade setup after the entity tab is mounted.',
    arguments: [{
      listen: [ENTITY_OPENED], valued: true, parameter: 'id',
      description: 'Global id of the entity whose tab was mounted.', type: 'str',
    }, {
      listen: [ENTITY_OPENED], valued: true, parameter: 'panelId',
      description: 'DOM id of the mounted entity panel.', type: 'str',
    }],
  };

  constructor(private readonly event: AppEvent<AppEventMap[typeof ENTITY_OPENED]>) {}

  async run(): Promise<void> {
    const request = this.event.payload;
    if (!request?.id || !request.panelId) throw new Error('The opened entity panel carries no entity or panel id.');
    try {
      await new SetUpEntityFacadeMachine(request).execute();
    } catch (error) {
      // An entity of a type the ontology does not know keeps the fields it was mounted with.
      if (!(error instanceof EntityFacadeUnavailableError)) throw error;
    } finally {
      // Whatever came of the setup, no field is left waiting behind a skeleton.
      const panel = document.getElementById(request.panelId);
      if (panel) clearPending(panel);
    }
  }
}
