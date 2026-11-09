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

/** The flags that ask a container (or a project) to be refreshed or checked, and the components they are of. */
const CONFIG_FLAGS = ['--refresh', '--health'];
const CONFIG_COMPONENTS = ['container', 'project'];

/**
 * The command, given the config of the application when it refreshes or checks a container: its constraint is what
 * the refresh replicates into the container, and what the check compares the container with. A command that was given
 * a `--config` already keeps it.
 */
function withConfig(command: RewrittenCommand): RewrittenCommand {
  const { argv } = command;
  if (!CONFIG_COMPONENTS.includes(argv[1] ?? '') || !CONFIG_FLAGS.some((flag) => argv.includes(flag)) || argv.includes('--config')) return command;
  return { ...command, argv: [...argv, '--config', Config.constraintBody()] };
}

/** The command after every rewriter of the config changed it, and given the config of the application; the same command when neither applies. */
export function rewriteCommand(command: RewrittenCommand): RewrittenCommand {
  return withConfig(rewriters().reduce((current, rewriter) => rewriter.rewrite(current), command));
}

/** The programs a command may start with: `ontobdc`, and the ones the rewriters run. */
export function commandPrograms(): string[] {
  return ['ontobdc', ...rewriters().flatMap((rewriter) => rewriter.programs ?? [])];
}

/** The packages the rewriters run on, besides the ones of the core. */
export function commandPackages(): CommandPackage[] {
  return rewriters().flatMap((rewriter) => rewriter.packages ?? []);
}
