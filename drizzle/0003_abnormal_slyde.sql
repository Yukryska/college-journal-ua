DROP INDEX `submission_per_student`;--> statement-breakpoint
ALTER TABLE `submissions` ADD `isDemo` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `submission_per_student` ON `submissions` (`courseworkId`,`studentId`,`isDemo`);