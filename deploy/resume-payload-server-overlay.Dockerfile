# syntax=docker/dockerfile:1.7
# Oracle2: derive only the fixed request-parser module from the running
# Job Harness custom image. The current image already includes the v2.3
# renderer template and the BOSS-related customizations.
#
# Build:
#   docker build -f deploy/resume-payload-server-overlay.Dockerfile \
#     --build-arg BASE_IMAGE=job-harness:resume-v23-overlay-20261013 \
#     -t job-harness:resume-payload-20261014 .
ARG BASE_IMAGE=job-harness:resume-v23-overlay-20261013
FROM ${BASE_IMAGE}
COPY --chown=node:node apps/server/src/server.ts /app/apps/server/src/server.ts
