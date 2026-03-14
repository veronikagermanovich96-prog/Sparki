-- Extra categories: comfortable spending amounts per category or tag (subcategory)
-- If tag_id IS NULL → applies to the whole category
-- If tag_id IS NOT NULL → applies to a specific subcategory (tag)

DROP TABLE IF EXISTS category_extras;

CREATE TABLE category_extras (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id    uuid REFERENCES households(id),
  category_id     uuid REFERENCES categories(id),
  tag_id          uuid REFERENCES category_tags(id) ON DELETE CASCADE,
  comfortable_amount numeric(15,2) NOT NULL,
  currency        text NOT NULL DEFAULT 'USD',
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now()
);

-- Two partial unique indexes to handle NULL tag_id correctly
CREATE UNIQUE INDEX category_extras_cat_tag_idx
  ON category_extras (household_id, category_id, tag_id)
  WHERE tag_id IS NOT NULL;

CREATE UNIQUE INDEX category_extras_cat_only_idx
  ON category_extras (household_id, category_id)
  WHERE tag_id IS NULL;
