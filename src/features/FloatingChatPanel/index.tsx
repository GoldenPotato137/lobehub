'use client';

import { ThreadType, type UIChatMessage } from '@lobechat/types';
import { FloatingSheet, type FloatingSheetProps } from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import type { ReactNode } from 'react';
import { memo, useEffect, useMemo, useState } from 'react';

import {
  type ActionsBarConfig,
  type ConversationHooks,
  ConversationProvider,
} from '@/features/Conversation';
import { useChatFollowUp } from '@/features/Conversation/hooks/useChatFollowUp';
import { type ConversationContext } from '@/features/Conversation/types';
import { mergeConversationHooks } from '@/features/Conversation/utils/mergeConversationHooks';
import { useOperationState } from '@/hooks/useOperationState';
import { useActionsBarConfig } from '@/routes/(main)/agent/features/Conversation/useActionsBarConfig';
import { useAgentStore } from '@/store/agent';
import { chatConfigByIdSelectors } from '@/store/agent/selectors';
import { useChatStore } from '@/store/chat';
import { messageMapKey } from '@/store/chat/utils/messageMapKey';

import ChatBody from './ChatBody';
import { useSingleInstanceGuard } from './guard';

const SNAP_POINTS = [180, 320, 520, 800] as const;
const MAX_SNAP_POINT = SNAP_POINTS.at(-1)!;
const REST_SNAP_POINT = SNAP_POINTS[0];

const styles = createStaticStyles(({ css }) => ({
  sheet: css`
    overflow: hidden;
    display: flex;
    flex: 1;
    flex-direction: column;

    min-height: 0;
  `,
  header: css`
    display: flex;
    flex-shrink: 0;
    gap: 8px;
    align-items: center;
    justify-content: space-between;
  `,
  title: css`
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  body: css`
    overflow: hidden;
    display: flex;
    flex-direction: column;

    width: 100%;
    height: 100%;
    min-height: 0;
  `,
}));

export interface FloatingChatPanelProps {
  /**
   * Override the actions bar config. When omitted, defaults to the shared
   * `useActionsBarConfig()` hook for parity with the main agent page.
   */
  actionsBar?: ActionsBarConfig;
  activeSnapPoint?: number;
  /**
   * Agent document row id (`agent_documents.id`) for the document the user is
   * viewing. When supplied, the active document is injected with
   * `agent_document_id` so LLM tool calls (`readDocument` / `modifyNodes`) can
   * use it directly without a `listDocuments` reverse lookup.
   */
  agentDocumentId?: string;
  agentId: string;
  className?: string;
  dismissible?: boolean;
  /**
   * Active document id for the conversation context. Passed through so the
   * `ActiveTopicDocumentContextInjector` can tell the LLM which agent document
   * the user is currently viewing (e.g. when opened from a document preview
   * portal). Omit when no document is in focus.
   */
  documentId?: string;
  headerActions?: ReactNode;
  /**
   * Conversation lifecycle hooks. Forwarded into the internal
   * `ConversationProvider`. The panel wraps `onAfterSendMessage` to auto-expand
   * the sheet to its tallest snap point on send.
   */
  hooks?: ConversationHooks;
  maxHeight?: number;
  minHeight?: number;
  mode?: 'embedded' | 'overlay';
  onOpenChange?: (open: boolean) => void;
  onSnapPointChange?: (point: number) => void;
  open?: boolean;
  /**
   * Conversation scope. Defaults to `'thread'` for ephemeral side-chat usage.
   * When `'thread'` and `threadId` is absent, the context is marked `isNew`
   * so a fresh thread can be created on first send (caller must supply
   * `sourceMessageId` + `threadType` via `hooks` / context override if real
   * thread persistence is required).
   */
  scope?: 'main' | 'thread';
  snapPoints?: number[];
  /** Opens an existing thread when set; otherwise the panel starts ephemeral. */
  threadId?: string | null;
  title?: ReactNode;
  /** Topic identifier. `null` means a new / unpersisted conversation. */
  topicId: string | null;
  variant?: 'elevated' | 'embedded';
  width?: number | string;
}

/**
 * FloatingChatPanel
 *
 * Reusable floating conversation panel — composes `ChatList` + `ChatInput`
 * inside a `FloatingSheet`. Consumers provide conversation coordinates via
 * flat `agentId` / `topicId` / `threadId` props; the panel builds its own
 * `ConversationContext` internally.
 *
 * Single instance per page (see `./guard.ts`).
 */
const FloatingChatPanel = memo<FloatingChatPanelProps>(
  ({
    agentId,
    topicId,
    threadId = null,
    documentId,
    agentDocumentId,
    scope = 'thread',
    actionsBar,
    hooks,

    minHeight: _minHeight = 240,
    maxHeight: _maxHeight = 0.9,

    width = '100%',

    title,
    headerActions,
  }) => {
    useSingleInstanceGuard();

    // Track the active thread internally so a new thread created on first send
    // can be adopted in-place without unmounting/remounting the panel.
    const [internalThreadId, setInternalThreadId] = useState<string | null>(threadId);
    useEffect(() => {
      setInternalThreadId(threadId);
    }, [threadId]);

    // Source message for `newThread`: the latest message of the topic's main
    // scope. Without this, `conversationLifecycle.ts:215` treats the send as a
    // plain topic message and never creates a thread row. Falls back to
    // ephemeral (no source) when the topic has no messages yet.
    const isCreatingNewThread = scope === 'thread' && !internalThreadId;
    const sourceMessageId = useChatStore((s) => {
      if (!isCreatingNewThread || !topicId) return undefined;
      const mainKey = messageMapKey({ agentId, topicId });
      const mainMessages = s.dbMessagesMap[mainKey];
      if (!mainMessages?.length) return undefined;
      // Anchor on the latest main-scope message (ignore thread-scoped rows).
      for (let i = mainMessages.length - 1; i >= 0; i -= 1) {
        const msg = mainMessages[i]!;
        if (!msg.threadId) return msg.id;
      }
      return undefined;
    });

    const context = useMemo<ConversationContext>(
      () => ({
        agentId,
        ...(agentDocumentId ? { agentDocumentId } : {}),
        ...(documentId ? { documentId } : {}),
        ...(isCreatingNewThread && sourceMessageId
          ? { isNew: true, sourceMessageId, threadType: ThreadType.Standalone }
          : isCreatingNewThread
            ? { isNew: true }
            : {}),
        scope,
        threadId: internalThreadId,
        topicId,
      }),
      [
        agentId,
        agentDocumentId,
        documentId,
        internalThreadId,
        isCreatingNewThread,
        scope,
        sourceMessageId,
        topicId,
      ],
    );

    const chatKey = useMemo(() => messageMapKey(context), [context]);
    const messages = useChatStore((s) => s.dbMessagesMap[chatKey]);
    const replaceMessages = useChatStore((s) => s.replaceMessages);

    const operationState = useOperationState(context);
    const defaultActionsBar = useActionsBarConfig();
    const resolvedActionsBar = actionsBar ?? defaultActionsBar;

    const handleMessagesChange = useMemo(
      () => (next: UIChatMessage[], ctx: ConversationContext) => {
        replaceMessages(next, { context: ctx });
      },
      [replaceMessages],
    );

    const [open, setOpen] = useState(true);
    const [activeSnapPoint, setActiveSnapPoint] = useState<number>(REST_SNAP_POINT);

    const agentChatConfig = useAgentStore(chatConfigByIdSelectors.getChatConfigById(agentId));
    const chatFollowUpHooks = useChatFollowUp({
      agentChatConfig,
      conversationKey: chatKey,
      threadId: internalThreadId ?? undefined,
      topicId: topicId ?? undefined,
    });

    const mergedHooks = useMemo<ConversationHooks>(
      () =>
        mergeConversationHooks(
          hooks,
          {
            // Expand the sheet the moment the user presses Send, so the chat grows
            // into view before the AI response streams in — not after it finishes.
            onBeforeSendMessage: async () => {
              setActiveSnapPoint(MAX_SNAP_POINT);
            },
            // Adopt the freshly created thread in-panel: refresh the thread
            // list (so the sidebar `ThreadList` picks it up) and pivot this
            // panel's context from `isNew` to the persisted threadId. We
            // deliberately skip `openThreadInPortal` — that would push a Thread
            // view onto the portal stack and cover the document the user is
            // looking at.
            onAfterMessageCreate: async ({ createdThreadId }) => {
              if (!createdThreadId) return;
              const state = useChatStore.getState();
              await state.refreshThreads();
              await state.refreshMessages();
              setInternalThreadId(createdThreadId);
            },
          },
          chatFollowUpHooks,
        ),
      [hooks, chatFollowUpHooks],
    );

    const sheetProps: FloatingSheetProps = {
      activeSnapPoint,
      className: 'floating-sheet-demo-inline',
      closeThreshold: 0.3,
      defaultOpen: true,
      dismissible: false,
      headerActions,

      maxHeight: MAX_SNAP_POINT,
      minHeight: SNAP_POINTS[1],
      mode: 'inline',
      onOpenChange: setOpen,
      onSnapPointChange: setActiveSnapPoint,
      open,
      restingHeight: REST_SNAP_POINT,
      snapPoints: [...SNAP_POINTS],
      title,

      variant: 'embedded',
      width,
    };

    return (
      <FloatingSheet {...sheetProps}>
        <div className={styles.body}>
          <ConversationProvider
            actionsBar={resolvedActionsBar}
            context={context}
            hasInitMessages={!!messages}
            hooks={mergedHooks}
            messages={messages}
            operationState={operationState}
            onMessagesChange={handleMessagesChange}
          >
            <ChatBody />
          </ConversationProvider>
        </div>
      </FloatingSheet>
    );
  },
);

FloatingChatPanel.displayName = 'FloatingChatPanel';

export default FloatingChatPanel;
