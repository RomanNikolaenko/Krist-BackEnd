-- Colours and sizes stop being enums and become rows an administrator can add to.
--
-- The order lines are converted rather than replaced. Prisma's own diff wanted
-- to drop and re-add those two columns, which would have thrown away what every
-- customer has already bought; a line keeps its own copy of what was ordered for
-- exactly this reason, so the values are cast across and normalised to the names
-- the shop shows.

ALTER TABLE "order_items" ALTER COLUMN "size" TYPE TEXT USING "size"::text;
ALTER TABLE "order_items" ALTER COLUMN "color" TYPE TEXT USING "color"::text;

-- RED -> Red, and REGULAR -> Regular. The rest of the sizes are already the
-- letters the shop displays.
UPDATE "order_items" SET "color" = initcap(lower("color")) WHERE "color" IS NOT NULL;
UPDATE "order_items" SET "size" = 'Regular' WHERE "size" = 'REGULAR';

-- The product arrays go; the seed rebuilds the links from the catalogue.
ALTER TABLE "products" DROP COLUMN "colors", DROP COLUMN "sizes";

DROP TYPE "ProductColor";
DROP TYPE "ProductSize";

CREATE TABLE "colors" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "hex" VARCHAR(9) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "colors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sizes" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sizes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "_ColorToProduct" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_ColorToProduct_AB_pkey" PRIMARY KEY ("A","B")
);

CREATE TABLE "_ProductToSize" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_ProductToSize_AB_pkey" PRIMARY KEY ("A","B")
);

CREATE UNIQUE INDEX "colors_name_key" ON "colors"("name");
CREATE UNIQUE INDEX "colors_slug_key" ON "colors"("slug");
CREATE UNIQUE INDEX "sizes_name_key" ON "sizes"("name");
CREATE UNIQUE INDEX "sizes_slug_key" ON "sizes"("slug");
CREATE INDEX "_ColorToProduct_B_index" ON "_ColorToProduct"("B");
CREATE INDEX "_ProductToSize_B_index" ON "_ProductToSize"("B");

ALTER TABLE "_ColorToProduct" ADD CONSTRAINT "_ColorToProduct_A_fkey" FOREIGN KEY ("A") REFERENCES "colors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_ColorToProduct" ADD CONSTRAINT "_ColorToProduct_B_fkey" FOREIGN KEY ("B") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_ProductToSize" ADD CONSTRAINT "_ProductToSize_A_fkey" FOREIGN KEY ("A") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_ProductToSize" ADD CONSTRAINT "_ProductToSize_B_fkey" FOREIGN KEY ("B") REFERENCES "sizes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
