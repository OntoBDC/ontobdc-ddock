/** What a state machine wraps the reason of a failure in: `'<reason>' occurred while executing '<what it was doing>'`. */
const MACHINE_WRAPPER = /^'([\s\S]*)' occurred while executing '[^']*'$/;

/** The reason of a failure without the words the machine that met it put around it. */
export function unwrapMachineError(text: string): string {
  return MACHINE_WRAPPER.exec(text.trim())?.[1] ?? text;
}

/** A failure told as a line and, under it, the reasons it lists, each on a line of its own that starts with `- `. */
export function failureParts(text: string): { summary: string; reasons: string[] } {
  const [summary, ...lines] = text.split('\n');
  return { summary, reasons: lines.filter((line) => line.startsWith('- ')).map((line) => line.slice(2)) };
}
