# Architecture

The CLI owns deterministic workspace structure. Managed skills own semantic setup and review workflows.

`init` and `doctor` share the same finding pipeline so setup remains idempotent.
