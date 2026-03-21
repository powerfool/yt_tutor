-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "anthropicApiKey" TEXT,
    "youtubeApiKey" TEXT,
    "chatSystemPrompt" TEXT,
    "chatVideoOnlyPrompt" TEXT,
    "chatGeneralPrompt" TEXT,
    "suggestFreshNoChapter" TEXT,
    "suggestFreshWithChapter" TEXT,
    "suggestHistoryWithChapter" TEXT,
    "suggestHistoryNoChapter" TEXT,
    "chaptersSystemPrompt" TEXT,
    "chaptersUserPrompt" TEXT
);
