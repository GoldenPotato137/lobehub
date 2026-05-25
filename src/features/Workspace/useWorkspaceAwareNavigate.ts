'use client';

import { useCallback } from 'react';
import {
  type NavigateFunction,
  type NavigateOptions,
  type To,
  useNavigate,
} from 'react-router-dom';

import { useWorkspaceStore, workspaceSelectors } from '@/store/workspace';

import { buildWorkspaceAwarePath, type WorkspaceAwareNavigateOptions } from './workspaceAwarePath';

export type { WorkspaceAwareNavigateOptions } from './workspaceAwarePath';

/**
 * `useNavigate` from react-router-dom, extended with an `escape` option for
 * skipping workspace-prefix logic on personal-only destinations.
 */
export interface WorkspaceAwareNavigateFunction extends NavigateFunction {
  (to: To, options?: WorkspaceAwareNavigateOptions): void;
  (delta: number): void;
}

/**
 * Drop-in replacement for `useNavigate` that auto-prefixes absolute path
 * strings with the active workspace slug. Numeric deltas (`navigate(-1)`),
 * `Partial<Path>` objects, and relative path strings pass through unchanged.
 *
 * Pass `{ escape: true }` to bypass prefixing for personal-only destinations.
 */
export const useWorkspaceAwareNavigate = (): WorkspaceAwareNavigateFunction => {
  const navigate = useNavigate();
  const activeSlug = useWorkspaceStore((s) => workspaceSelectors.activeWorkspace(s)?.slug ?? null);

  return useCallback(
    ((to: To | number, options?: WorkspaceAwareNavigateOptions) => {
      if (typeof to === 'number') {
        return navigate(to);
      }
      if (typeof to !== 'string') {
        // `Partial<Path>` object — pass through unchanged.
        return navigate(to, options as NavigateOptions | undefined);
      }
      const target = buildWorkspaceAwarePath(to, activeSlug, options);
      const { escape: _escape, ...rest } = options ?? {};
      void _escape;
      return navigate(target, rest);
    }) as WorkspaceAwareNavigateFunction,
    [navigate, activeSlug],
  );
};
