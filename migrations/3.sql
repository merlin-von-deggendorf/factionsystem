CREATE TABLE IF NOT EXISTS `polls` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `message_id` INT UNSIGNED NOT NULL,
  `poll_type` ENUM('single', 'multi') NOT NULL,
  `is_open` TINYINT(1) NOT NULL DEFAULT 1,
  `end_at` DATETIME NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `polls_message_id_idx` (`message_id`),
  KEY `polls_is_open_idx` (`is_open`),
  CONSTRAINT `polls_message_fk` FOREIGN KEY (`message_id`)
    REFERENCES `messages` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `poll_options` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `poll_id` INT UNSIGNED NOT NULL,
  `option_text` VARCHAR(255) NOT NULL,
  `position` INT UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `poll_options_poll_position_unique` (`poll_id`, `position`),
  KEY `poll_options_poll_id_idx` (`poll_id`),
  CONSTRAINT `poll_options_poll_fk` FOREIGN KEY (`poll_id`)
    REFERENCES `polls` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `poll_votes` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `option_id` INT UNSIGNED NOT NULL,
  `user_id` INT UNSIGNED NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `poll_votes_unique` (`option_id`, `user_id`),
  KEY `poll_votes_user_id_idx` (`user_id`),
  KEY `poll_votes_option_id_idx` (`option_id`),
  CONSTRAINT `poll_votes_option_fk` FOREIGN KEY (`option_id`)
    REFERENCES `poll_options` (`id`)
    ON DELETE CASCADE,
  CONSTRAINT `poll_votes_user_fk` FOREIGN KEY (`user_id`)
    REFERENCES `usertable` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
