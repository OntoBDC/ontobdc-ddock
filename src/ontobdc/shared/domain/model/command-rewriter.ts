import type { PythonMount } from '@/ontobdc/shared/domain/model/python-command';

/** A command as it will run: the arguments (the first is the program) and the folder it is mounted on. */
export type RewrittenCommand = { argv: string[]; mount: PythonMount };

/** A Python package the runtime holds, by the name it is installed under. */
export type CommandPackage = { name: string; label: string };

/** What an addon's `plugin/command` module exports to change the commands before they run. */
export type CommandRewriter = {
  rewrite(command: RewrittenCommand): RewrittenCommand;
  /** The programs the addon runs, besides `ontobdc`, that a person may type too. */
  programs?: string[];
  /** The packages the addon runs on, shown with the others in the about menu. */
  packages?: CommandPackage[];
};
