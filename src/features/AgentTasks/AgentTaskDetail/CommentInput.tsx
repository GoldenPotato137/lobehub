import { Editor, SendButton, useEditor } from '@lobehub/editor/react';
import { Avatar, Flexbox } from '@lobehub/ui';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  AttachmentPreviewList,
  AttachmentUploadButton,
  useAttachmentUpload,
} from '@/features/AttachmentInput';
import { useEnterToSend } from '@/hooks/useEnterToSend';
import { useUserAvatar } from '@/hooks/useUserAvatar';
import { useTaskStore } from '@/store/task';

import { styles } from '../shared/style';

const CommentInput = memo<{ taskId: string }>(({ taskId }) => {
  const { t } = useTranslation('chat');
  const editor = useEditor();
  const addComment = useTaskStore((s) => s.addComment);
  const userAvatar = useUserAvatar();
  const [submitting, setSubmitting] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const shouldSendOnEnter = useEnterToSend();
  const attachments = useAttachmentUpload();

  const hasAttachments = attachments.items.length > 0;
  const canSubmit = hasContent || hasAttachments;
  // Block submission until every upload finishes; otherwise fileIds would be incomplete.
  const { uploading } = attachments;

  const handleSubmit = useCallback(async () => {
    const trimmed = String(editor?.getDocument?.('markdown') ?? '').trim();
    if (submitting || uploading) return;
    if (!trimmed && attachments.fileIds.length === 0) return;
    setSubmitting(true);
    try {
      await addComment(taskId, trimmed, {
        fileIds: attachments.fileIds.length > 0 ? attachments.fileIds : undefined,
      });
      editor?.cleanDocument?.();
      setHasContent(false);
      attachments.clear();
    } finally {
      setSubmitting(false);
    }
  }, [taskId, editor, addComment, submitting, uploading, attachments]);

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

export default CommentInput;
