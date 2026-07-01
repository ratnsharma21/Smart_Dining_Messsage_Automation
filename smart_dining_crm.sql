-- ============================================================================
-- SQL Database Schema for "Smart Dining Restaurant" CRM
-- Target Database: MySQL 8.0+
-- No sample data - starts completely clean.
-- ============================================================================

CREATE DATABASE IF NOT EXISTS `smart_dining_crm`;
USE `smart_dining_crm`;

-- ============================================================================
-- 1. CUSTOMERS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS `customers` (
    `customer_id` INT AUTO_INCREMENT NOT NULL,
    `full_name` VARCHAR(100) NOT NULL,
    `phone_number` VARCHAR(20) NOT NULL,
    `email_address` VARCHAR(100) DEFAULT NULL,
    `gender` ENUM('Male', 'Female', 'Other', 'Prefer not to say') DEFAULT NULL,
    `date_of_birth` DATE DEFAULT NULL,
    `anniversary_date` DATE DEFAULT NULL,
    `address` VARCHAR(255) DEFAULT NULL,
    `registration_date` DATE NOT NULL,
    `last_visit_date` DATE DEFAULT NULL,
    `total_visits` INT DEFAULT 0,
    `total_amount_spent` DECIMAL(10, 2) DEFAULT 0.00,
    `customer_category` ENUM('New', 'Regular', 'VIP') DEFAULT 'New',
    `loyalty_points` INT DEFAULT 0,
    `preferred_channel` ENUM('WhatsApp', 'SMS', 'Email') DEFAULT 'WhatsApp',
    `marketing_consent` ENUM('Yes', 'No') DEFAULT 'No',
    PRIMARY KEY (`customer_id`),
    UNIQUE KEY `uq_phone_number` (`phone_number`),
    INDEX `idx_full_name` (`full_name`),
    INDEX `idx_customer_category` (`customer_category`),
    INDEX `idx_last_visit_date` (`last_visit_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 2. FAMILY MEMBERS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS `family_members` (
    `family_member_id` INT AUTO_INCREMENT NOT NULL,
    `customer_id` INT NOT NULL,
    `family_member_name` VARCHAR(100) NOT NULL,
    `relationship` VARCHAR(50) NOT NULL,
    `date_of_birth` DATE DEFAULT NULL,
    `anniversary_date` DATE DEFAULT NULL,
    `special_occasion_type` VARCHAR(50) DEFAULT NULL,
    PRIMARY KEY (`family_member_id`),
    CONSTRAINT `fk_family_members_customer` FOREIGN KEY (`customer_id`) 
        REFERENCES `customers` (`customer_id`) ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX `idx_family_customer` (`customer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 3. SPECIAL OCCASIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS `special_occasions` (
    `occasion_id` INT AUTO_INCREMENT NOT NULL,
    `customer_id` INT NOT NULL,
    `occasion_name` VARCHAR(100) NOT NULL,
    `occasion_type` ENUM('Birthday', 'Anniversary', 'Graduation', 'Promotion', 'Other') NOT NULL,
    `occasion_date` DATE NOT NULL,
    `reminder_days_before` INT DEFAULT 3,
    PRIMARY KEY (`occasion_id`),
    CONSTRAINT `fk_occasions_customer` FOREIGN KEY (`customer_id`) 
        REFERENCES `customers` (`customer_id`) ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX `idx_occasions_customer` (`customer_id`),
    INDEX `idx_occasion_date` (`occasion_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 4. CUSTOMER PREFERENCES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS `customer_preferences` (
    `preference_id` INT AUTO_INCREMENT NOT NULL,
    `customer_id` INT NOT NULL,
    `favorite_dish` VARCHAR(100) DEFAULT NULL,
    `favorite_cuisine` VARCHAR(100) DEFAULT NULL,
    `spice_preference` ENUM('Mild', 'Medium', 'Hot', 'Extra Hot') DEFAULT 'Medium',
    `dietary_preference` ENUM('Veg', 'Non-Veg', 'Vegan', 'Jain') DEFAULT 'Non-Veg',
    `preferred_seating` ENUM('Window', 'Booth', 'Outdoor', 'Quiet Corner', 'Bar', 'No Preference') DEFAULT 'No Preference',
    `special_notes` TEXT DEFAULT NULL,
    PRIMARY KEY (`preference_id`),
    CONSTRAINT `uq_preference_customer` UNIQUE (`customer_id`),
    CONSTRAINT `fk_preferences_customer` FOREIGN KEY (`customer_id`) 
        REFERENCES `customers` (`customer_id`) ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX `idx_preferences_customer` (`customer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 5. RESTAURANT VISITS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS `restaurant_visits` (
    `visit_id` INT AUTO_INCREMENT NOT NULL,
    `customer_id` INT NOT NULL,
    `visit_date` DATETIME NOT NULL,
    `number_of_guests` INT NOT NULL DEFAULT 1,
    `total_bill_amount` DECIMAL(10, 2) NOT NULL,
    `feedback_rating` INT DEFAULT NULL,
    `feedback_comment` TEXT DEFAULT NULL,
    PRIMARY KEY (`visit_id`),
    CONSTRAINT `fk_visits_customer` FOREIGN KEY (`customer_id`) 
        REFERENCES `customers` (`customer_id`) ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX `idx_visits_customer` (`customer_id`),
    INDEX `idx_visit_date` (`visit_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 6. MESSAGE HISTORY TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS `message_history` (
    `message_id` INT AUTO_INCREMENT NOT NULL,
    `customer_id` INT NOT NULL,
    `message_channel` ENUM('WhatsApp', 'SMS', 'Email') NOT NULL,
    `message_content` TEXT NOT NULL,
    `sent_datetime` DATETIME NOT NULL,
    `delivery_status` ENUM('Pending', 'Sent', 'Delivered', 'Failed') DEFAULT 'Pending',
    `delivery_type` ENUM('Automated', 'Manual') DEFAULT 'Automated',
    `occasion` VARCHAR(50) DEFAULT NULL,
    PRIMARY KEY (`message_id`),
    CONSTRAINT `fk_history_customer` FOREIGN KEY (`customer_id`) 
        REFERENCES `customers` (`customer_id`) ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX `idx_history_customer` (`customer_id`),
    INDEX `idx_sent_datetime` (`sent_datetime`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 7. SYSTEM SETTINGS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS `system_settings` (
    `setting_key` VARCHAR(50) NOT NULL,
    `setting_value` TEXT DEFAULT NULL,
    PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- DEFAULT SYSTEM SETTINGS ONLY (no customer/visit data)
-- ============================================================================
INSERT IGNORE INTO `system_settings` (`setting_key`, `setting_value`) VALUES
('smtp_host', 'smtp.gmail.com'),
('smtp_port', '587'),
('smtp_secure', 'tls'),
('smtp_user', 'dine09663@gmail.com'),
('smtp_pass', 'pwmnkucwvrkjvqql'),
('sms_provider', 'simulated'),
('sms_host', ''),
('sms_token', 'xKr0nTsYhWVyam2H5kOCAcQDF83gwJPM1tNjLGq7EfR9XobB6SwZgsNrJTfdOYWzAuh6BveimURoD790'),
('sms_sender', '9026678700'),
('whatsapp_provider', 'simulated'),
('whatsapp_host', ''),
('whatsapp_token', ''),
('whatsapp_sender', ''),
('custom_bday_msg', 'Dear {name},\n\nWe at Smart Dining Restaurant wish you a very Happy Birthday! Enjoy a complimentary dessert and 15% off on your next visit with us. Use code BDAY15.\n\nWarm regards,\nSmart Dining Team'),
('custom_anniv_msg', 'Dear {name},\n\nHappy Anniversary to you and your partner from all of us at Smart Dining Restaurant! Celebrate your special day at our restaurant and receive a complimentary bottle of sparkling mocktails.\n\nWarm regards,\nSmart Dining Team');
