# Study Summary Bot — Bot specification

**Archetype:** custom

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

A Telegram bot that extracts text from uploaded study materials (PDFs, images, text files) and generates concise 3-5 sentence summaries. Users can request rephrased or adjusted-length summaries via commands, and the bot tracks processing status with error handling for failed extractions.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- students
- professionals

## Success criteria

- Generates accurate 3-5 sentence summaries for 80% of valid documents
- Provides clear error messages with actionable suggestions for 100% of failed extractions
- Allows users to rephrase/expand/shorten summaries within 3 seconds of command

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open main menu with usage instructions
- **Upload file** (command, actor: user, command: /document) — Send any supported study material file to trigger summarization
  - inputs: file
  - outputs: summary text
- **/rephrase** (command, actor: user, command: /rephrase) — Request alternative phrasing of last summary
- **/expand** (command, actor: user, command: /expand) — Request longer 7-10 sentence summary
- **/shorten** (command, actor: user, command: /shorten) — Request shorter 1-2 sentence summary

## Flows

### Document processing
_Trigger:_ document

1. Acknowledge receipt with 'Received — summarizing now' message
2. Extract text via OCR (images) or parsing (PDF/DOCX/TXT)
3. Generate 3-5 sentence summary
4. Reply with summary in original chat thread

_Data touched:_ Document, Summary, Job

### Summary adjustment
_Trigger:_ /rephrase

1. Validate previous summary exists
2. Rephrase existing summary
3. Replace original summary with new version

_Data touched:_ Summary

### Error handling
_Trigger:_ extraction failure

1. Log failed job
2. Notify user with error reason
3. Suggest file resubmission options

_Data touched:_ Job

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **User** _(retention: persistent)_ — Telegram user who interacts with the bot
  - fields: telegram_id, last_interaction_time
- **Document** _(retention: persistent)_ — Uploaded study material file
  - fields: file_id, name, size, type, upload_time
- **Summary** _(retention: persistent)_ — Generated summary of document content
  - fields: content, length_version, generation_time
- **Job** _(retention: session)_ — Processing task status tracking
  - fields: status, error_details, retry_count

## Integrations

- **Telegram Bot API** (required) — Message handling and file processing
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Enable admin failure notifications
- Set threshold for repeated failure alerts (default: 3 failures)

## Notifications

- Admin notified when processing fails 3+ times for a user

## Permissions & privacy

- Only process files explicitly sent to the bot
- Delete job records after 30 days

## Edge cases

- Unsupported file types (e.g., videos)
- OCR errors in low-quality images
- Commands used without prior document upload

## Required tests

- Verify end-to-end processing from file upload to summary delivery
- Test error handling with corrupted files
- Validate summary adjustment commands work on existing summaries

## Assumptions

- Using OpenAI API for summarization
- OCR handled by Telegram's built-in capabilities or external service
- 30-day retention period for all job records
