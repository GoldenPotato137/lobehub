import type { IEditor } from '@lobehub/editor';
import { $getNearestNodeFromDOMNode } from 'lexical';

/**
 * When the user clicks on a FileNode in the editor (a `[icon] filename` card
 * rendered by `@lobehub/editor`'s `ReactFile` decorator), open the file URL in
 * a new tab so they can preview/download it. The vendor decorator's default
 * behavior only marks the node as selected, with no preview affordance and no
 * download button — see LOBE-9202 for the longer-term renderer replacement.
 *
 * Two subtleties:
 *
 * 1. We use a native DOM click listener on the editor root with
 *    `capture: true`. Lexical attaches its own bubble-phase listener on the
 *    same root and may stop propagation when a decorator node is clicked, so
 *    capturing earlier in the phase is the only reliable way to intercept.
 *
 * 2. We resolve the clicked DOM → Lexical node via
 *    `lexicalEditor.read(...)`, NOT `editorState.read(...)`. The former
 *    installs the active-editor context that `$getNearestNodeFromDOMNode`
 *    needs to disambiguate when multiple editors share the page.
 */
export const registerAttachmentClickOpen = (editor: IEditor): (() => void) | undefined => {
  const lexicalEditor = editor.getLexicalEditor?.();
  if (!lexicalEditor) return;

  const onClick = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    // Fast path: skip the editor read transaction for clicks on plain text,
    // which is the overwhelming majority while typing. Decorator nodes carry
    // `data-lexical-decorator="true"` on their wrapper.
    if (!target.closest('[data-lexical-decorator="true"]')) return;

    let url: string | undefined;
    lexicalEditor.read(() => {
      const node = $getNearestNodeFromDOMNode(target);
      if (node?.getType?.() === 'file') {
        url = (node as unknown as { __fileUrl?: string }).__fileUrl;
      }
    });

    if (url) {
      // Synchronous click → window.open keeps the gesture trusted so
      // browser popup blockers don't intervene.
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  let attached: HTMLElement | null = null;
  const unregister = lexicalEditor.registerRootListener((rootElement, prevRootElement) => {
    if (prevRootElement && attached === prevRootElement) {
      attached.removeEventListener('click', onClick, true);
      attached = null;
    }
    if (rootElement) {
      rootElement.addEventListener('click', onClick, true);
      attached = rootElement;
    }
  });

  return () => {
    if (attached) {
      attached.removeEventListener('click', onClick, true);
      attached = null;
    }
    unregister();
  };
};
