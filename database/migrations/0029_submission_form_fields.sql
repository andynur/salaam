-- Assignment submissions support the structured student submission form.
ALTER TABLE submissions ADD COLUMN screenshot_file_id uuid UNIQUE REFERENCES stored_files(id);
ALTER TABLE submissions ADD COLUMN github_url text NOT NULL DEFAULT '' CHECK (length(github_url) <= 2000);
ALTER TABLE submissions ADD COLUMN jam_url text NOT NULL DEFAULT '' CHECK (length(jam_url) <= 2000);
ALTER TABLE submissions ADD COLUMN feedback text NOT NULL DEFAULT '' CHECK (length(feedback) <= 5000);
CREATE INDEX submissions_screenshot_idx ON submissions(screenshot_file_id) WHERE screenshot_file_id IS NOT NULL;
