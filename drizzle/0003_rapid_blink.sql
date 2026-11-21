CREATE TABLE `whatsappConversas` (
	`telefone` varchar(20) NOT NULL,
	`etapa` varchar(32) NOT NULL DEFAULT 'inicio',
	`dados` text,
	`pedidoId` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `whatsappConversas_telefone` PRIMARY KEY(`telefone`)
);
