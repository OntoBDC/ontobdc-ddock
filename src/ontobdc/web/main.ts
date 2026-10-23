import '@/asset/common.css';
import '@xterm/xterm/css/xterm.css';
import 'dockview/dist/styles/dockview.css';
import '@/asset/dockview-theme.css';

import { loadPanelFactories } from '@/ontobdc/web/adapter/plugin-loader';
import { ListenerLoader } from '@/ontobdc/web/adapter/loader';
import { renderShell } from '@/ontobdc/web/adapter/layout';
import { initSurface } from '@/ontobdc/web/adapter/surface';
import { initBottom } from '@/ontobdc/web/adapter/bottom';
import { initSidebar } from '@/ontobdc/web/adapter/sidebar';
import { initAssistant } from '@/ontobdc/web/adapter/assistant';
import { initPython } from '@/ontobdc/shared/adapter/python';
import { Session } from '@/ontobdc/shared/adapter/session';
import { EntityRepository } from '@/ontobdc/shared/adapter/entity-repository';
import { ContainerRepository } from '@/ontobdc/shared/adapter/container-repository';
import { initContainerStatus } from '@/ontobdc/web/adapter/container-status';
import { setupSplitters } from '@/ontobdc/web/adapter/splitters';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Application root not found');

const componentFactories = await loadPanelFactories();
const disposeSurface = initSurface(componentFactories);
const disposeBottom = initBottom(componentFactories);
const disposeSidebar = initSidebar(componentFactories);
const disposeAssistant = initAssistant(componentFactories);
const disposePython = initPython();
const containerRepository = ContainerRepository.getInstance();
const entityRepository = EntityRepository.getInstance();
Session.getInstance();
const disposeContainerStatus = initContainerStatus();
const disposeListeners = await new ListenerLoader().load();

renderShell(app);
setupSplitters(app);

if (import.meta.hot) import.meta.hot.dispose(() => {
  disposeSurface();
  disposeBottom();
  disposeSidebar();
  disposeAssistant();
  containerRepository.dispose();
  entityRepository.dispose();
  disposeContainerStatus();
  disposeListeners();
  disposePython();
});
