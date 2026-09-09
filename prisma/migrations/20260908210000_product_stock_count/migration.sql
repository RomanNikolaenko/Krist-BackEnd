-- A count where there was a flag.
--
-- Written by hand so the shelves are not emptied on the way past: everything
-- currently on sale starts at 25, everything marked out of stock starts at 0.
-- Prisma's own diff would have dropped the column and defaulted the new one to
-- zero, which is a shop with nothing left in it.
ALTER TABLE "products" ADD COLUMN "stock" INTEGER NOT NULL DEFAULT 0;

UPDATE "products" SET "stock" = CASE WHEN "inStock" THEN 25 ELSE 0 END;

ALTER TABLE "products" DROP COLUMN "inStock";
