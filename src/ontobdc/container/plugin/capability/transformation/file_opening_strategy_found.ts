import { eventBus } from '@/ontobdc/shared/adapter/event-bus';
import { fileMetadataOf } from '@/ontobdc/shared/adapter/file-metadata';
import chainSource from '../../machine/explorer_file_open/standard_explorer_file_open_chain.yaml?raw';
import { ChainOfResponsibilityWorkerAdapter } from '@/ontobdc/shared/adapter/chain-worker';
import { chainName } from '@/ontobdc/shared/adapter/statechart-converter';
import type { CapabilityContext, CapabilityMetadata } from '@/ontobdc/shared/domain/model/capability';
import type { ChainResponsibilityClass } from '@/ontobdc/shared/domain/model/chain';

type CapabilityModule = Record<string, unknown>;

/** Discover the capabilities of this folder and of the addons, without executing them yet. */
const capabilityImports = import.meta.glob<CapabilityModule>([
  './*.ts',
  '@/addon/*/plugin/capability/transformation/*.ts',
]);

/**
 * Determines how the activated file should be opened by running the open-file
 * chain: each responsibility is an ordinary capability, of this folder or of an
 * addon, that also implements `canHandle`. When none of them handles the file,
 * `presentation.explorer.file.unsupported` says so.
 */
export class FileOpeningStrategyFoundCapability {
  static readonly METADATA: CapabilityMetadata = {
    id: 'org.ontobdc.container.plugin.capability.transformation.target.file_opening_strategy_found',
    description: 'Determine how the activated file should be opened.',
  };

  async execute(context: CapabilityContext): Promise<void> {
    const candidates = await this.chainCandidates();
    const worker = new ChainOfResponsibilityWorkerAdapter(chainName(chainSource), candidates, context);
    const handled = await worker.work();
    if (handled.length === 0) {
      const item = context.parameters.item ?? '';
      eventBus.publish('presentation.explorer.file.unsupported', 'file_opening_strategy_found', {
        item,
        extension: fileMetadataOf(context)?.extension ?? '',
      });
    }

    context.etl.write('explorer_file_open', context.requestId, context.state, {
      phase: 'done',
      entity: {},
      result: { handled },
    });
  }

  private async chainCandidates(): Promise<ChainResponsibilityClass[]> {
    const candidates: ChainResponsibilityClass[] = [];
    for (const load of Object.values(capabilityImports)) {
      for (const exported of Object.values(await load())) {
        if (typeof exported !== 'function') continue;
        const canHandle = (exported.prototype as { canHandle?: unknown } | undefined)?.canHandle;
        if (typeof canHandle !== 'function') continue;
        candidates.push(exported as ChainResponsibilityClass);
      }
    }
    return candidates;
  }
}
