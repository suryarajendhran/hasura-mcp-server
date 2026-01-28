CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS authors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO authors (name)
VALUES
  ('Ada Lovelace'),
  ('Grace Hopper')
ON CONFLICT DO NOTHING;

INSERT INTO articles (author_id, title, body)
SELECT a.id, 'Foundations', 'First program in the world.'
FROM authors a
WHERE a.name = 'Ada Lovelace'
ON CONFLICT DO NOTHING;

INSERT INTO articles (author_id, title, body)
SELECT a.id, 'Compilers', 'COBOL and beyond.'
FROM authors a
WHERE a.name = 'Grace Hopper'
ON CONFLICT DO NOTHING;
