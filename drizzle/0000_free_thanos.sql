CREATE TABLE `assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`groupId` text NOT NULL,
	`subjectId` text NOT NULL,
	`teacherId` text,
	FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subjectId`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`teacherId`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `group_subject_unique` ON `assignments` (`groupId`,`subjectId`);--> statement-breakpoint
CREATE TABLE `auditLogs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`message` text NOT NULL,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`course` integer NOT NULL,
	`specialty` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `groups_name_unique` ON `groups` (`name`);--> statement-breakpoint
CREATE TABLE `lessons` (
	`id` text PRIMARY KEY NOT NULL,
	`groupId` text NOT NULL,
	`subjectId` text NOT NULL,
	`date` text NOT NULL,
	`number` integer NOT NULL,
	`type` text NOT NULL,
	`topic` text NOT NULL,
	`homework` text NOT NULL,
	FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subjectId`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lesson_slot_unique` ON `lessons` (`groupId`,`subjectId`,`date`,`number`);--> statement-breakpoint
CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`lessonId` text NOT NULL,
	`studentId` text NOT NULL,
	`grade` integer,
	`attendance` text,
	`note` text DEFAULT '' NOT NULL,
	`updatedAt` text NOT NULL,
	FOREIGN KEY (`lessonId`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "grade_range" CHECK("records"."grade" is null or ("records"."grade" between 1 and 12)),
	CONSTRAINT "attendance_type" CHECK("records"."attendance" is null or "records"."attendance" in ('present','absent','excused'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `student_lesson_unique` ON `records` (`studentId`,`lessonId`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `students` (
	`id` text PRIMARY KEY NOT NULL,
	`groupId` text NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`archived` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`groupId`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `subjects` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`teacherName` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`authId` text,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`studentId` text,
	FOREIGN KEY (`studentId`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "user_role" CHECK("users"."role" in ('admin','teacher','student'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_authId_unique` ON `users` (`authId`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);