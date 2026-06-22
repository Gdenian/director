ALTER TABLE `user`
  ADD COLUMN `role` VARCHAR(191) NOT NULL DEFAULT 'user',
  ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT 'active';

CREATE INDEX `user_role_idx` ON `user`(`role`);
CREATE INDEX `user_status_idx` ON `user`(`status`);

CREATE TABLE `admin_audit_logs` (
  `id` VARCHAR(191) NOT NULL,
  `actorUserId` VARCHAR(191) NOT NULL,
  `actorRole` VARCHAR(191) NOT NULL,
  `action` VARCHAR(191) NOT NULL,
  `targetType` VARCHAR(191) NOT NULL,
  `targetId` VARCHAR(191) NULL,
  `beforeJson` JSON NULL,
  `afterJson` JSON NULL,
  `reason` TEXT NULL,
  `ip` VARCHAR(128) NULL,
  `userAgent` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `admin_audit_logs_actorUserId_idx` ON `admin_audit_logs`(`actorUserId`);
CREATE INDEX `admin_audit_logs_actorRole_idx` ON `admin_audit_logs`(`actorRole`);
CREATE INDEX `admin_audit_logs_action_idx` ON `admin_audit_logs`(`action`);
CREATE INDEX `admin_audit_logs_targetType_targetId_idx` ON `admin_audit_logs`(`targetType`, `targetId`);
CREATE INDEX `admin_audit_logs_createdAt_idx` ON `admin_audit_logs`(`createdAt`);
