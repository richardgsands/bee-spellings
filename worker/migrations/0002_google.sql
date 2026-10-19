-- Google handwriting reading of the same strokes, for comparison on the dashboard.
ALTER TABLE checks ADD COLUMN google_read TEXT;
ALTER TABLE checks ADD COLUMN google_error TEXT;
