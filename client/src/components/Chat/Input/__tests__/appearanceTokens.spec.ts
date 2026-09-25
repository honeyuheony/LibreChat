import { join } from 'node:path';
import { readFileSync } from 'node:fs';

const inputRoot = join(__dirname, '..');
const source = (file: string): string => readFileSync(join(inputRoot, file), 'utf8');

const themedControls = [
  /** The submit slot's three faces share one recipe, which owns the coarse-pointer
   *  tap-target floor as well as the geometry; its tokens are asserted where it
   *  lives (`composer.spec.ts`). Copying the class string back into any of them
   *  would take that floor off a phone silently, so the recipe is what is checked. */
  ['SendButton.tsx', ['composerSubmitClasses()']],
  ['StopButton.tsx', ['composerSubmitClasses()']],
  ['DuringRunSendButton.tsx', ['composerSubmitClasses()']],
  ['InterruptSteerButton.tsx', ['size-theme-control', 'rounded-theme-control-round']],
  ['AudioRecorder.tsx', ['size="theme"', 'shape="theme"']],
  /** Controls that draw their shape from `composerControlClasses()` prove it by
   *  consuming the shared recipe; its own tokens are asserted where it lives. */
  ['CodeApprovalMenu.tsx', ['composerControlClasses()', 'md:px-theme-normal']],
  ['TokenUsage/index.tsx', ['size-theme-control', 'rounded-theme-control-round']],
  ['Files/AttachFile.tsx', ['size-theme-control', 'rounded-theme-control-round']],
  /** The `+` control and the tools trigger are bordered rounded squares, like Send. */
  ['Files/AttachFileMenu.tsx', ['size-theme-control', 'rounded-theme-control border']],
  ['ToolsMenu.tsx', ['rounded-theme-control border', 'border-border-light']],
  /** Floats over the thread rather than sitting in the composer, but stacks
   *  over Send on the same rail, so it takes the row's geometry from the shared
   *  `Button` recipe; the tokens behind those variants are asserted in `Button.spec`. */
  ['../../Messages/ScrollToBottom.tsx', ['size="icon-theme"', 'shape="round"']],
] as const;

describe('Composer appearance tokens', () => {
  it.each(themedControls)('%s uses shared control geometry', (file, expectedTokens) => {
    const contents = source(file);

    expectedTokens.forEach((token) => expect(contents).toContain(token));
  });
});
