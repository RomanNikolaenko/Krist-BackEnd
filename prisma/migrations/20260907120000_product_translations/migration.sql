-- Product text in languages other than the base one.
--
-- Additive: `products.name` and `products.description` stay put as the English
-- source and as the fallback, so nothing has to be moved and a product with no
-- translation reads exactly as it did before.
CREATE TABLE "product_translations" (
    "productId" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "product_translations_pkey" PRIMARY KEY ("productId", "locale")
);

ALTER TABLE "product_translations"
    ADD CONSTRAINT "product_translations_productId_fkey" FOREIGN KEY ("productId")
    REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
