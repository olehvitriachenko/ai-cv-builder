# Data Model: Submission Readiness

No database change. Two small concepts:

## Run configuration

The settings a reviewer provides; see [contracts/run-configuration.md](./contracts/run-configuration.md). Not stored: read from the environment at start. Validation: the API refuses to start on an invalid value; an absent or empty key is valid and means "no real generation".

## PDF preparation (client state)

| State | Meaning | Visible |
|-------|---------|---------|
| idle | no download running | nothing |
| preparing | the request has started | the button is disabled and the message is shown at once |
| preparing (finished early) | the response came before 700 ms | the message stays until 700 ms have passed |
| finishing | the file arrived or the request failed | the message stays until it has been visible for 700 ms, then goes |

Transitions: idle → preparing on Download PDF (only one at a time); preparing → idle when the file arrives (the download starts) or when it fails (the existing failure message is shown). Closing the preview does not cancel the request. The state is local to the preview and is never stored or sent.

The expected file name is derived from the candidate name and the target role (see research R6).
