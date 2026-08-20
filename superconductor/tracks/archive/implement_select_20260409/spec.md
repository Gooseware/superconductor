# Specification: Track Selection and Initiation in `implement` Command

## Overview
The `implement` command will be updated to provide an interactive selection of currently planned tracks. It will also offer a free-text field to directly define and start a new track, enhancing the user's ability to manage and execute tasks.

## Functional Requirements
1. **Read Tracks Registry:** The `implement` command must read the `superconductor/tracks.md` file to identify existing tracks.
2. **Interactive Selection & Input:** Present the identified tracks to the user and provide a text field for defining a new track within a single `ask_user` tool call.
3. **Selection Logic:**
    - If the user selects an existing track, initiate the implementation workflow for that track.
    - If the user provides a description in the text field, trigger the `newTrack` logic for a new track.
4. **Status Check:** Ensure that only tracks with a status of "new" or "in_progress" (as defined in their `metadata.json`) are presented as primary options for implementation.

## Non-Functional Requirements
1. **Responsiveness:** The track retrieval and selection process should be fast and non-obstructive.
2. **User Guidance:** Clear instructions and examples should be provided within the `ask_user` prompts.

## Acceptance Criteria
1. Running `/superconductor:implement` without a specific track ID displays a list of available tracks and a text field for a new one.
2. Selecting a track from the list initiates the implementation workflow for that track.
3. Entering a description in the text field transitions the user to the track requirement gathering phase for a new track.
4. The system correctly handles the case where no tracks are currently planned.

## Out of Scope
1. Directly editing `tracks.md` through the `implement` command (except for initiating a new track).
2. Complex filtering or sorting of tracks in the selection UI.
