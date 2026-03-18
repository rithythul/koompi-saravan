import { describe, expect, test } from 'bun:test';
import path from 'path';

import { assertSupportedCompositionId, getRemotionProjectRoot, SUPPORTED_COMPOSITIONS } from './render';

describe('render helpers', () => {
  test('resolves the remotion project root to the package directory', () => {
    expect(path.basename(getRemotionProjectRoot())).toBe('remotion-template');
  });

  test('declares HookReveal as a supported composition', () => {
    expect(SUPPORTED_COMPOSITIONS).toContain('HookReveal');
  });

  test('rejects unsupported composition ids', () => {
    expect(() => assertSupportedCompositionId('UnknownComposition')).toThrow(
      'Unsupported composition id',
    );
  });
});
