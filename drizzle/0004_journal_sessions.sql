CREATE TABLE `journalSessions` (
	`tokenHash` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`keyHash` text NOT NULL,
	`expiresAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `journal_session_expiry` ON `journalSessions` (`expiresAt`);