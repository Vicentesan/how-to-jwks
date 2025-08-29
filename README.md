# JWKS Example for vicentesan.dev

## Overview
This repository contains a minimal example demonstrating JSON Web Key Set (JWKS) management and authentication flows, used in accompanying articles on vicentesan.dev. It focuses on clear primitives for key rotation, token issuance/validation, and session handling.

## What this includes
- JWKS key storage and retrieval primitives
- Session and token validation utilities
- Environment-driven configuration
- Development-only OpenAPI documentation exposed at `/docs`

## State and persistence
Redis is used to store state critical for authentication (including keys metadata and sessions), ensuring that keys are not lost across application restarts.

## API and documentation
- OpenAPI documentation is available at `/docs` when `APP_ENV=dev`.
- Security scheme: HTTP bearer with JWT (`Authorization: Bearer <token>`).