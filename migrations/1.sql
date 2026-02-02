CREATE TABLE IF NOT EXISTS `usertable` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(30) NOT NULL COLLATE utf8mb4_general_ci,
  `password` CHAR(100) NOT NULL COLLATE utf8mb4_bin,
  `mail` VARCHAR(60) NOT NULL COLLATE utf8mb4_general_ci,
  PRIMARY KEY (`id`),
  UNIQUE KEY `usertable_username_unique` (`username`),
  UNIQUE KEY `usertable_mail_unique` (`mail`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
