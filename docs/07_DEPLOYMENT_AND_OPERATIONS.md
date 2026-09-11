# Deployment and Operations

## Runtime

Build with Bun 1.4.2, run migrations before routing traffic, and start the bundled
server as a non-root user behind an HTTPS reverse proxy. Keep private storage outside
the static asset directory.

## Configuration

Provide production values through a secret manager or protected environment file.
Require HTTPS in production, set the school timezone explicitly, and keep database
credentials out of source control.

## Health and shutdown

Use `/health/live` for process liveness and `/health/ready` for database readiness.
The server must close the PostgreSQL pool during graceful shutdown and enforce a finite
shutdown timeout.

## Backups and maintenance

Rotate logs, monitor disk and database connections, back up PostgreSQL and private
storage to another location, and verify restores regularly. Apply migrations as a
release step and keep applied migration files immutable.

## Rollout checklist

Freeze the deployment window, run the test suite and build, apply migrations, verify
health endpoints, perform a smoke login and permission check, confirm backup status,
and record the release identifier. Keep a rollback plan for application code and
database changes.
