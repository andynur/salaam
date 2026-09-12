-- Project deliverables reuse the course-scoped private file store.
ALTER TABLE projects ADD COLUMN deliverable_file_id uuid;
ALTER TABLE projects ADD CONSTRAINT projects_deliverable_file_fk
  FOREIGN KEY (deliverable_file_id, course_id) REFERENCES stored_files(id, course_id);
ALTER TABLE projects ADD CONSTRAINT projects_one_deliverable_check
  CHECK (deliverable_url IS NULL OR deliverable_file_id IS NULL);
