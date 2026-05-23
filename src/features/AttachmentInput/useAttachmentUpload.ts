import { useCallback, useRef, useState } from 'react';

import { useFileStore } from '@/store/file';
import { type UploadFileItem } from '@/types/files';

/**
 * Local attachment state for non-chat surfaces (Task comments, Task instruction).
 * Lighter alternative to `useFileStore.uploadChatFiles`, which is wired into a
 * chat-session-scoped store slice we don't need here.
 *
 * Failed uploads stay in the list with `status='error'` so the user can retry
 * or remove them. Removing a still-uploading item aborts its in-flight request
 * via an AbortController so we don't keep a half-uploaded blob on the server.
 */
export const useAttachmentUpload = () => {
  const uploadWithProgress = useFileStore((s) => s.uploadWithProgress);
  const [items, setItems] = useState<UploadFileItem[]>([]);
  const tempIdSeqRef = useRef(0);
  const abortControllersRef = useRef(new Map<string, AbortController>());

  const updateItem = useCallback((id: string, patch: Partial<UploadFileItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const addFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      const initialItems: UploadFileItem[] = files.map((file) => ({
        file,
        id: `pending-${++tempIdSeqRef.current}`,
        status: 'pending',
      }));
      setItems((prev) => [...prev, ...initialItems]);

      await Promise.all(
        files.map(async (file, idx) => {
          const tempId = initialItems[idx].id;
          const abortController = new AbortController();
          abortControllersRef.current.set(tempId, abortController);
          try {
            const result = await uploadWithProgress({
              abortController,
              file,
              onStatusUpdate: (event) => {
                if (event.type === 'updateFile') {
                  updateItem(tempId, event.value);
                } else if (event.type === 'removeFile') {
                  setItems((prev) => prev.filter((it) => it.id !== tempId));
                }
              },
              uploadId: tempId,
            });
            if (!result) {
              updateItem(tempId, { status: 'error' });
              return;
            }
            setItems((prev) =>
              prev.map((it) =>
                it.id === tempId
                  ? { ...it, fileUrl: result.url, id: result.id, status: 'success' }
                  : it,
              ),
            );
          } catch {
            updateItem(tempId, { status: 'error' });
          } finally {
            abortControllersRef.current.delete(tempId);
          }
        }),
      );
    },
    [uploadWithProgress, updateItem],
  );

  const removeItem = useCallback((id: string) => {
    abortControllersRef.current.get(id)?.abort();
    abortControllersRef.current.delete(id);
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const clear = useCallback(() => {
    for (const ctrl of abortControllersRef.current.values()) ctrl.abort();
    abortControllersRef.current.clear();
    setItems([]);
  }, []);

  const fileIds = items.filter((it) => it.status === 'success').map((it) => it.id);
  const uploading = items.some((it) => it.status === 'uploading' || it.status === 'pending');

  return { addFiles, clear, fileIds, items, removeItem, uploading };
};
