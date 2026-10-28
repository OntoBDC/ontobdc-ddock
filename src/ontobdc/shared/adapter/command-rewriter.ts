import { Config } from '@/ontobdc/shared/adapter/config';
import type { CommandPackage, CommandRewriter, RewrittenCommand } from '@/ontobdc/shared/domain/model/command-rewriter';

/** The command rewriters of the addons. */
const modules = import.meta.glob<CommandRewriter>('@/addon/*/plugin/command/*.ts', { eager: true });

/** The rewriters of the addons named by `override.command`, in that order. */
function rewriters(): CommandRewriter[] {
  return Config.commandAddons().flatMap((addon) =>
    Object.entries(modules)
      .filter(([path]) => path.includes(`/addon/${addon}/plugin/command/`))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, module]) => module),
  );
}

/** The command after every rewriter of the config changed it; the same command when the config names none. */
export function rewriteCommand(command: RewrittenCommand): RewrittenCommand {
  return rewriters().reduce((current, rewriter) => rewriter.rewrite(current), command);
}

/** The programs a command may start with: `ontobdc`, and the ones the rewriters run. */
export function commandPrograms(): string[] {
  return ['ontobdc', ...rewriters().flatMap((rewriter) => rewriter.programs ?? [])];
}

/** The packages the rewriters run on, besides the ones of the core. */
export function commandPackages(): CommandPackage[] {
  return rewriters().flatMap((rewriter) => rewriter.packages ?? []);
}
