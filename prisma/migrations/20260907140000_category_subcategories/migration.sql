-- Categories gain one level of nesting.
--
-- Additive: every existing row keeps a null parent and stays a department, so
-- nothing that referenced a category before this needs to change.
ALTER TABLE "categories" ADD COLUMN "parentId" UUID;

CREATE INDEX "categories_parentId_idx" ON "categories"("parentId");

-- Restrict rather than cascade: deleting a department should say what is inside
-- it, not silently take the lot.
ALTER TABLE "categories"
    ADD CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId")
    REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
