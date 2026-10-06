# Data Model: Submission Readiness

No database change. Two small concepts:

## Run configuration

The settings a reviewer provides; see [contracts/run-configuration.md](./contracts/run-configuration.md). Not stored: read from the environment at start. Validation: the API refuses to start on an invalid value; an absent or empty key is valid and means "no real generation".

## PDF preparation (client state)

| State | Meaning | Visible |
|-------|---------|---------|
| idle | no download running | nothing |
| preparing (short) | the request started less than 300 ms ago | the navigation action reads "Preparing…" and is disabled |
| preparing (shown) | still running after 300 ms | plus the dimmed preview and the message |
| finishing | the file arrived or the request failed | the message stays until it has been visible for 700 ms, then goes |

Transitions: idle → preparing on Download PDF (only one at a time); preparing → idle when the file arrives (the download starts) or when it fails (the existing failure message is shown). Closing the preview does not cancel the request. The state is local to the preview and is never stored or sent.

The expected file name is derived from the candidate name and the target role (see research R6).
