# syntax=docker/dockerfile:1.7
# Oracle2: preserve the running Job Harness server custom base image.
# Only refresh the shared renderer source/templates and the v2.3 authoring
# helper. Server API continues to use its existing runtime/profiles/secrets.
#
# docker build --build-arg BASE_IMAGE=job-harness:boss-groq-secret-85ebcb2 \
#   -f deploy/resume-v23-server-overlay.Dockerfile \
#   -t job-harness:resume-v23-overlay-20261013 .
ARG BASE_IMAGE=job-harness:boss-groq-secret-85ebcb2
FROM ${BASE_IMAGE}
COPY --chown=node:node packages/resume-renderer/src/ /app/packages/resume-renderer/src/
COPY --chown=node:node packages/resume-renderer/templates/ /app/packages/resume-renderer/templates/
COPY --chown=node:node scripts/resume-frontend-v2-3.mts /app/scripts/resume-frontend-v2-3.mts
