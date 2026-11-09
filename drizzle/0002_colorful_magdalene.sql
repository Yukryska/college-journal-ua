CREATE TABLE `coursework` (
	`id` text PRIMARY KEY NOT NULL,
	`groupId` text NOT NULL,
	`subjectId` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`dueDate` text,
	`fileName` text,
	`createdAt` text NOT NULL,
	FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subjectId`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "coursework_kind" CHECK("coursework"."kind" in ('lecture','assignment'))
);
--> statement-breakpoint
CREATE INDEX `coursework_scope` ON `coursework` (`groupId`,`subjectId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`courseworkId` text NOT NULL,
	`studentId` text NOT NULL,
	`fileName` text NOT NULL,
	`submittedAt` text NOT NULL,
	`grade` integer,
	`feedback` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`courseworkId`) REFERENCES `coursework`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "submission_grade_range" CHECK("submissions"."grade" is null or "submissions"."grade" between 1 and 12)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `submission_per_student` ON `submissions` (`courseworkId`,`studentId`);