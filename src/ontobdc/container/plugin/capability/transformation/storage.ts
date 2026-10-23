import { parseCliResponse, unwrapCliText } from '@/ontobdc/shared/adapter/container-format';
import { ContainerCreationCancelledError } from '@/ontobdc/shared/domain/exception/container-creation';
import type { DirectoryPicker, DirectoryPickerOptions } from '@/ontobdc/shared/adapter/container-source';
import type { PythonCommandResult } from '@/ontobdc/shared/domain/model/python-command';

export const isDomError = (error: unknown, name: string): boolean => error instanceof DOMException && error.name === name;

/** The browser directory picker, if the browser has one. */
export const pickerOf = (): DirectoryPicker | undefined => {
  const picker = (window as Window & { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker;
  return picker?.bind(window);
};

/** The error a failed CLI run reports, in the CLI's own words. */
export function cliError(result: PythonCommandResult): string {
  const error = parseCliResponse<{ error?: string }>(result.stdout)?.content?.error;
  return error ? unwrapCliText(error) : result.stderr.trim() || `Command failed (exit ${result.code}).`;
}

/** Asks the person for a folder; closing the picker is a cancellation and a refusal says why. */
export async function pickFolder(options: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle> {
  const picker = pickerOf();
  if (!picker) throw new Error('The browser cannot pick a folder.');
  try {
    return await picker(options);
  } catch (error) {
    if (isDomError(error, 'AbortError')) throw new ContainerCreationCancelledError();
    const denied = isDomError(error, 'NotAllowedError') || isDomError(error, 'SecurityError');
    throw new Error(denied ? 'Permission to write to the folder was denied.' : 'The folder could not be picked.', { cause: error });
  }
}
