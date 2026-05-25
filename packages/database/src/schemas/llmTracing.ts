import { boolean, index, integer, jsonb, numeric, pgTable, text, uuid } from 'drizzle-orm/pg-core';

import { timestamptz } from './_helpers';
import { workspaces } from './workspace';

export const llmGenerationTracing = pgTable(
  'llm_generation_tracing',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    scenario: text('scenario').notNull(),
    promptVersion: text('prompt_version').notNull(),
    promptHash: text('prompt_hash').notNull(),
    schemaName: text('schema_name'),

    userId: text('user_id').notNull(),
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),

    agentId: text('agent_id'),
    topicId: text('topic_id'),
    trigger: text('trigger'),

    parentTracingId: uuid('parent_tracing_id'),

    provider: text('provider'),
    model: text('model'),

    success: boolean('success').notNull(),
    errorCode: text('error_code'),
    errorDetail: text('error_detail'),
    validationFailed: boolean('validation_failed').notNull().default(false),

    inputHash: text('input_hash'),
    inputHint: text('input_hint'),

    latencyMs: integer('latency_ms'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    costUsd: numeric('cost_usd', { precision: 12, scale: 8 }),

    storageKey: text('storage_key'),

    feedbackSignal: text('feedback_signal'),
    feedbackScore: numeric('feedback_score', { precision: 3, scale: 2 }),
    feedbackSource: text('feedback_source'),
    feedbackData: jsonb('feedback_data'),
    feedbackUpdatedAt: timestamptz('feedback_updated_at'),

    traceId: text('trace_id'),
    spanId: text('span_id'),

    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),

    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('llm_generation_tracing_scenario_idx').on(t.scenario),
    index('llm_generation_tracing_prompt_version_idx').on(t.promptVersion),
    index('llm_generation_tracing_user_id_idx').on(t.userId),
    index('llm_generation_tracing_workspace_id_idx').on(t.workspaceId),
    index('llm_generation_tracing_agent_id_idx').on(t.agentId),
    index('llm_generation_tracing_topic_id_idx').on(t.topicId),
    index('llm_generation_tracing_provider_idx').on(t.provider),
    index('llm_generation_tracing_model_idx').on(t.model),
    index('llm_generation_tracing_success_idx').on(t.success),
    index('llm_generation_tracing_error_code_idx').on(t.errorCode),
    index('llm_generation_tracing_validation_failed_idx').on(t.validationFailed),
    index('llm_generation_tracing_feedback_signal_idx').on(t.feedbackSignal),
    index('llm_generation_tracing_created_at_idx').on(t.createdAt),
  ],
);

export type NewLlmGenerationTracing = typeof llmGenerationTracing.$inferInsert;
export type LlmGenerationTracingItem = typeof llmGenerationTracing.$inferSelect;
