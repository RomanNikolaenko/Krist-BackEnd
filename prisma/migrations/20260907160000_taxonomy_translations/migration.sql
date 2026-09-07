-- Category and colour names in languages other than the base one.
--
-- The front end had these compiled into its dictionary, which meant a category
-- an administrator added could never be translated. Additive: every existing
-- name stays where it is and remains the fallback.
CREATE TABLE "category_translations" (
    "categoryId" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "category_translations_pkey" PRIMARY KEY ("categoryId", "locale")
);

CREATE TABLE "color_translations" (
    "colorId" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "color_translations_pkey" PRIMARY KEY ("colorId", "locale")
);

ALTER TABLE "category_translations"
    ADD CONSTRAINT "category_translations_categoryId_fkey" FOREIGN KEY ("categoryId")
    REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "color_translations"
    ADD CONSTRAINT "color_translations_colorId_fkey" FOREIGN KEY ("colorId")
    REFERENCES "colors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
