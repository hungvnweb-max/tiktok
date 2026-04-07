# API_CONTRACTS

## 1. Purpose
This document defines the API contracts for the AI TikTok video automation system.

Goals:
- keep backend/frontend behavior consistent
- make state transitions explicit
- prevent unsafe operations
- support typed DTO generation
- remain extensible for future features

This document is a product-level API contract reference.
Implementation may be REST or RPC style, but behavior must remain consistent.

---

## 2. General Rules

### 2.1 API Design Rules
- all endpoints must use typed request and response contracts
- all endpoints must validate input
- all mutation endpoints must enforce safe state transitions
- all async operations must return status references when applicable
- error responses must be structured and consistent

### 2.2 Standard Error Response
All errors should follow a consistent structure:

```json
{
  "error": {
    "code": "string",
    "message": "string",
    "details": {}
  }
}
```
