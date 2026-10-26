ALTER TABLE "orders" ADD COLUMN "ship_ref" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipment_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "awb" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "courier" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "ship_status" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "ship_error" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "ship_synced_at" timestamp with time zone;