# Changelog

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
