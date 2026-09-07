-- A product now belongs to several categories instead of exactly one.
--
-- Written by hand rather than generated. The generated diff drops
-- `products.categoryId` and creates the join table, in that order, which would
-- leave every product in the catalogue with no category at all. The INSERT in
-- the middle is the whole point of this file: each existing assignment becomes
-- a row in the join table before the column that held it goes away.

CREATE TABLE "_CategoryToProduct" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,
    CONSTRAINT "_CategoryToProduct_AB_pkey" PRIMARY KEY ("A", "B")
);

CREATE INDEX "_CategoryToProduct_B_index" ON "_CategoryToProduct"("B");

-- Carry every product's current category over.
INSERT INTO "_CategoryToProduct" ("A", "B")
SELECT "categoryId", "id" FROM "products";

ALTER TABLE "_CategoryToProduct"
    ADD CONSTRAINT "_CategoryToProduct_A_fkey" FOREIGN KEY ("A")
    REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "_CategoryToProduct"
    ADD CONSTRAINT "_CategoryToProduct_B_fkey" FOREIGN KEY ("B")
    REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "products" DROP CONSTRAINT "products_categoryId_fkey";
DROP INDEX "products_categoryId_idx";
ALTER TABLE "products" DROP COLUMN "categoryId";
