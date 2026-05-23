import type { IEditor } from '@lobehub/editor';
import { INSERT_FILE_COMMAND, INSERT_IMAGE_COMMAND } from '@lobehub/editor';

import { getFileIdForUrl } from './attachmentRegistry';

interface SerializedNode {
  children?: SerializedNode[];
  fileUrl?: string;
  src?: string;
  type?: string;
}

interface SerializedEditorJson {
  root?: SerializedNode;
}

const IMAGE_NODE_TYPES = new Set(['image', 'block-image', 'inline-image']);
const FILE_NODE_TYPE = 'file';

/**
 * Walk a serialized Lexical document, collect URLs from Image/File nodes,
 * and resolve them to fileIds via the attachment registry. URLs that have no
 * registered fileId (e.g. externally pasted image URLs) are silently skipped.
 */
export const getAttachmentFileIdsFromJson = (json: unknown): string[] => {
  const root = (json as SerializedEditorJson | undefined)?.root;
  if (!root) return [];

  const seen = new Set<string>();
  const out: string[] = [];

  const visit = (node: SerializedNode | undefined): void => {
    if (!node || typeof node !== 'object') return;
    const url =
      node.type && IMAGE_NODE_TYPES.has(node.type)
        ? node.src
        : node.type === FILE_NODE_TYPE
          ? node.fileUrl
          : undefined;

    if (url) {
      const fileId = getFileIdForUrl(url);
      if (fileId && !seen.has(fileId)) {
        seen.add(fileId);
        out.push(fileId);
      }
    }

    if (Array.isArray(node.children)) {
      for (const child of node.children) visit(child);
    }
  };

  visit(root);
  return out;
};

/** Convenience: serializes the editor then walks it. Prefer the JSON variant
 *  when you already have the serialized state to avoid re-serializing. */
export const getAttachmentFileIdsFromEditor = (editor: IEditor | undefined): string[] => {
  if (!editor?.getLexicalEditor?.()) return [];
  return getAttachmentFileIdsFromJson(editor.getDocument?.('json'));
};

/**
 * Insert the given files inline at the editor's current selection. Images go
 * through `INSERT_IMAGE_COMMAND`; everything else goes through `INSERT_FILE_COMMAND`.
 */
export const insertFilesIntoEditor = (editor: IEditor | undefined, files: File[]): void => {
  if (!editor || files.length === 0) return;
  const lexicalEditor = editor.getLexicalEditor?.();
  if (!lexicalEditor) return;
  for (const file of files) {
    if (file.type.startsWith('image/')) {
      lexicalEditor.dispatchCommand(INSERT_IMAGE_COMMAND, { file });
    } else {
      lexicalEditor.dispatchCommand(INSERT_FILE_COMMAND, { file });
    }
  }
};

/**
 * Open the native file picker and dispatch the appropriate insert command for
 * each selected file. Thin wrapper around `insertFilesIntoEditor`.
 */
export const pickAndInsertAttachments = (editor: IEditor | undefined, accept?: string): void => {
  if (!editor?.getLexicalEditor?.()) return;

  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  if (accept) input.accept = accept;

  input.addEventListener('change', () => {
    insertFilesIntoEditor(editor, Array.from(input.files ?? []));
  });

  input.click();
};
