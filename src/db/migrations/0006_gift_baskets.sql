ALTER TABLE "orders" ADD COLUMN "gift_charge" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "gift" jsonb;--> statement-breakpoint
INSERT INTO "admin_records" ("list", "id", "data") VALUES
  ('baskets', 'classic', '{"id":"classic","name":"Classic basket","description":"Woven basket with ribbon","image":"/images/basket-classic.jpg","price":199,"status":"Active"}'),
  ('baskets', 'premium', '{"id":"premium","name":"Premium basket","description":"Lined basket with satin bow","image":"/images/basket-premium.jpg","price":499,"status":"Active"}'),
  ('baskets', 'luxury', '{"id":"luxury","name":"Luxury hamper","description":"Keepsake box with tissue and seal","image":"/images/basket-luxury.jpg","price":999,"status":"Active"}')
ON CONFLICT DO NOTHING;
