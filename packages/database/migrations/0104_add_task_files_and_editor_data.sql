CREATE TABLE IF NOT EXISTS "task_comments_files" (
	"file_id" text NOT NULL,
	"comment_id" text NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "task_comments_files_file_id_comment_id_pk" PRIMARY KEY("file_id","comment_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tasks_files" (
	"file_id" text NOT NULL,
	"task_id" text NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "tasks_files_file_id_task_id_pk" PRIMARY KEY("file_id","task_id")
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "editor_data" jsonb;--> statement-breakpoint
ALTER TABLE "task_comments_files" DROP CONSTRAINT IF EXISTS "task_comments_files_file_id_files_id_fk";--> statement-breakpoint
ALTER TABLE "task_comments_files" ADD CONSTRAINT "task_comments_files_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments_files" DROP CONSTRAINT IF EXISTS "task_comments_files_comment_id_task_comments_id_fk";--> statement-breakpoint
ALTER TABLE "task_comments_files" ADD CONSTRAINT "task_comments_files_comment_id_task_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."task_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments_files" DROP CONSTRAINT IF EXISTS "task_comments_files_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "task_comments_files" ADD CONSTRAINT "task_comments_files_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks_files" DROP CONSTRAINT IF EXISTS "tasks_files_file_id_files_id_fk";--> statement-breakpoint
ALTER TABLE "tasks_files" ADD CONSTRAINT "tasks_files_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks_files" DROP CONSTRAINT IF EXISTS "tasks_files_task_id_tasks_id_fk";--> statement-breakpoint
ALTER TABLE "tasks_files" ADD CONSTRAINT "tasks_files_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks_files" DROP CONSTRAINT IF EXISTS "tasks_files_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "tasks_files" ADD CONSTRAINT "tasks_files_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_comments_files_comment_id_idx" ON "task_comments_files" USING btree ("comment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_comments_files_user_id_idx" ON "task_comments_files" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_files_task_id_idx" ON "tasks_files" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_files_user_id_idx" ON "tasks_files" USING btree ("user_id");
