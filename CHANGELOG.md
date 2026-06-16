# Changelog

## [1.0.6] - 2026-06-16
- Added a Copy button to chat responses — click it to copy the message to your clipboard, with a brief "Copied!" confirmation

## [1.0.5] - 2026-06-15
- Fix Firefox extension — transcript detection and chat were completely broken after the v1.0.4 update (Firefox)

## [1.0.4] - 2026-06-12
- Customise AI prompts from Settings — edit the system prompt, focus mode instruction, and suggestion prompts for both YouTube and Webpage modes (advanced)

## [1.0.3] - 2026-06-12
- Fix AI responses being silently cut off mid-sentence — doubled the maximum response length and added a notice when a response is still cut short

## [1.0.2] - 2026-03-24
- Firefox extension now available
- Fix "Ask AI" button and context menu not working when notebook panel was active (Chrome and Firefox)
- Focus mode toggle, layout labels, and auto-growing chat input

## [1.0.1] - 2026-03-23
- Fix copy-to-notebook button from chat-only layout (NotebookPanel was unmounted when sidebar was in chat-only view)

## [1.0.0] - 2026-03-23
- YouTube mode: full transcript loaded into Claude context, sidebar opens automatically
- Webpage mode on any URL via toolbar icon; page content extracted and sent as context
- Highlight any text → floating Ask AI button quotes it into the chat input
- Built-in notebook with formatting preserved when copying AI responses
- Focus mode toggle: restrict Claude to page/video content only
- API key stored locally in the browser — never sent to any server
- Tab-aware context: chat history and notes saved and restored per page
- Initial Firefox release
