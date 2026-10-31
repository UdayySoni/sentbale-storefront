ALTER TABLE "collections" ADD COLUMN "image" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "ship_choice" jsonb;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "images" jsonb DEFAULT '[]'::jsonb NOT NULL;