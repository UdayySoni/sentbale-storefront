CREATE TABLE "password_resets" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"account_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "password_resets_account_idx" ON "password_resets" USING btree ("kind","account_id");