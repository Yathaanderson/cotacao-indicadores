CREATE TABLE `appSettings` (
	`key` varchar(64) NOT NULL,
	`value` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `appSettings_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `indicators` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`email` varchar(320) NOT NULL,
	`phone` varchar(32),
	`userId` int,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `indicators_id` PRIMARY KEY(`id`),
	CONSTRAINT `indicators_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `planOptionals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` text,
	`active` boolean NOT NULL DEFAULT true,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `planOptionals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quoteEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`requestId` int NOT NULL,
	`status` varchar(32) NOT NULL,
	`message` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `quoteEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quoteRequests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`publicToken` varchar(48) NOT NULL,
	`indicatorId` int NOT NULL,
	`indicatorName` varchar(120) NOT NULL,
	`status` enum('pendente','processando','concluida','falha','cancelada') NOT NULL DEFAULT 'pendente',
	`vehicleType` varchar(80) NOT NULL,
	`plate` varchar(12) NOT NULL,
	`brand` varchar(80),
	`model` varchar(160),
	`modelYear` varchar(12),
	`fipeValue` varchar(32),
	`clientName` varchar(160) NOT NULL,
	`clientPhone` varchar(32) NOT NULL,
	`clientEmail` varchar(320),
	`state` varchar(2) NOT NULL,
	`city` varchar(120) NOT NULL,
	`leadSource` varchar(80),
	`subOrigin` varchar(80),
	`notes` text,
	`optionals` text,
	`planName` varchar(160),
	`monthlyPrice` varchar(32),
	`quoteNumber` varchar(40),
	`shareUrl` varchar(512),
	`negotiationId` varchar(40),
	`errorMessage` text,
	`attempts` int NOT NULL DEFAULT 0,
	`alertedAt` timestamp,
	`startedAt` timestamp,
	`finishedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `quoteRequests_id` PRIMARY KEY(`id`),
	CONSTRAINT `quoteRequests_publicToken_unique` UNIQUE(`publicToken`)
);
