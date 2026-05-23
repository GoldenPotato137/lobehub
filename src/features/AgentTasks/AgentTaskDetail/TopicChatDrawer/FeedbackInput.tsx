import { Editor, SendButton, useEditor } from '@lobehub/editor/react';
import { Avatar, Flexbox } from '@lobehub/ui';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { shallow } from 'zustand/shallow';

import {
  AttachmentPreviewList,
  AttachmentUploadButton,
  useAttachmentUpload,
} from '@/features/AttachmentInput';
import { useEnterToSend } from '@/hooks/useEnterToSend';
import { useUserAvatar } from '@/hooks/useUserAvatar';
import { useTaskStore } from '@/store/task';

import { styles } from '../../shared/style';

interface FeedbackInputProps {
  taskId: string;
  topicId: string;
}

const FeedbackInput = memo<FeedbackInputProps>(({ taskId, topicId }) => {
  const { t } = useTranslation('chat');
  const editor = useEditor();
  const userAvatar = useUserAvatar();
  const { addComment, runTask, closeTopicDrawer } = useTaskStore(
    (s) => ({
      addComment: s.addComment,
      closeTopicDrawer: s.closeTopicDrawer,
      runTask: s.runTask,
    }),
    shallow,
  );
  const [submitting, setSubmitting] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const shouldSendOnEnter = useEnterToSend();
  const attachments = useAttachmentUpload();

  const hasAttachments = attachments.items.length > 0;
  const canSubmit = hasContent || hasAttachments;
  const { uploading } = attachments;

  const handleSubmit = useCallback(async () => {
    const trimmed = String(editor?.getDocument?.('markdown') ?? '').trim();
    if (submitting || uploading) return;
    if (!trimmed && attachments.fileIds.length === 0) return;
    setSubmitting(true);
    try {
      await addComment(taskId, trimmed, {
        fileIds: attachments.fileIds.length > 0 ? attachments.fileIds : undefined,
        topicId,
      });
      // Start a NEW topic run that picks up the comment we just attached to the
      // current topic. Do NOT pass continueTopicId — that would flip the
      // already-completed topic back to running and overwrite its operation id.
      try {
        await runTask(taskId);
      } catch (error) {
        console.warn('[FeedbackInput] runTask failed', error);
      }
      editor?.cleanDocument?.();
      setHasContent(false);
      attachments.clear();
      closeTopicDrawer();
    } finally {
      setSubmitting(false);
    }
  }, [
    taskId,
    topicId,
    editor,
    addComment,
    runTask,
    closeTopicDrawer,
    submitting,
    uploading,
    attachments,
  ]);

  return (
    <Flexbox className={styles.commentInputCard} gap={6}>
      <Flexbox horizontal align={'center'} gap={8}>
        <Avatar avatar={userAvatar} size={24} style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Editor
            content={''}
            editor={editor}
            enablePasteMarkdown={false}
            markdownOption={false}
            placeholder={t('taskDetail.commentPlaceholder')}
            type={'text'}
            variant={'chat'}
            onChange={(ed) => {
              setHasContent(!ed?.isEmpty);
            }}
            onPressEnter={({ event }) => {
              if (shouldSendOnEnter(event)) {
                handleSubmit();
                return true;
              }
            }}
          />
        </div>
        <Flexbox horizontal align={'center'} gap={4} style={{ flexShrink: 0 }}>
          <AttachmentUploadButton onFiles={attachments.addFiles} />
          <SendButton
            disabled={!canSubmit && !submitting}
            loading={submitting || uploading}
            shape={'round'}
            title={t('taskDetail.commentSubmitAndRun')}
            type={'text'}
            onClick={handleSubmit}
          />
        </Flexbox>
      </Flexbox>
      {hasAttachments && (
        <AttachmentPreviewList items={attachments.items} onRemove={attachments.removeItem} />
      )}
    </Flexbox>
  );
});

export default FeedbackInput;
