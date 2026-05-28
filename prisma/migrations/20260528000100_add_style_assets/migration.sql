CREATE TABLE `global_styles` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `folderId` VARCHAR(191) NULL,
  `name` VARCHAR(191) NOT NULL,
  `promptZh` TEXT NOT NULL,
  `promptEn` TEXT NULL,
  `referenceImageUrl` TEXT NULL,
  `referenceImageMediaId` VARCHAR(191) NULL,
  `previewImageUrl` TEXT NULL,
  `previewImageMediaId` VARCHAR(191) NULL,
  `isSystemSeed` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `global_styles_userId_idx` ON `global_styles`(`userId`);
CREATE INDEX `global_styles_folderId_idx` ON `global_styles`(`folderId`);
CREATE INDEX `global_styles_referenceImageMediaId_idx` ON `global_styles`(`referenceImageMediaId`);
CREATE INDEX `global_styles_previewImageMediaId_idx` ON `global_styles`(`previewImageMediaId`);

ALTER TABLE `global_styles`
  ADD CONSTRAINT `global_styles_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `global_styles_folderId_fkey` FOREIGN KEY (`folderId`) REFERENCES `global_asset_folders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `global_styles_referenceImageMediaId_fkey` FOREIGN KEY (`referenceImageMediaId`) REFERENCES `media_objects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `global_styles_previewImageMediaId_fkey` FOREIGN KEY (`previewImageMediaId`) REFERENCES `media_objects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `novel_promotion_projects`
  ADD COLUMN `styleAssetId` VARCHAR(191) NULL,
  ADD COLUMN `styleSnapshotName` VARCHAR(191) NULL,
  ADD COLUMN `stylePromptZh` TEXT NULL,
  ADD COLUMN `stylePromptEn` TEXT NULL,
  ADD COLUMN `styleSnapshotUpdatedAt` DATETIME(3) NULL;

ALTER TABLE `user_preferences`
  ADD COLUMN `defaultStyleId` VARCHAR(191) NULL;

ALTER TABLE `character_appearances`
  ADD COLUMN `styleAssetId` VARCHAR(191) NULL,
  ADD COLUMN `styleSnapshotName` VARCHAR(191) NULL,
  ADD COLUMN `stylePromptZh` TEXT NULL,
  ADD COLUMN `stylePromptEn` TEXT NULL,
  ADD COLUMN `styleSnapshotUpdatedAt` DATETIME(3) NULL;

ALTER TABLE `global_character_appearances`
  ADD COLUMN `styleAssetId` VARCHAR(191) NULL,
  ADD COLUMN `styleSnapshotName` VARCHAR(191) NULL,
  ADD COLUMN `stylePromptZh` TEXT NULL,
  ADD COLUMN `stylePromptEn` TEXT NULL,
  ADD COLUMN `styleSnapshotUpdatedAt` DATETIME(3) NULL;

ALTER TABLE `global_locations`
  ADD COLUMN `styleAssetId` VARCHAR(191) NULL,
  ADD COLUMN `styleSnapshotName` VARCHAR(191) NULL,
  ADD COLUMN `stylePromptZh` TEXT NULL,
  ADD COLUMN `stylePromptEn` TEXT NULL,
  ADD COLUMN `styleSnapshotUpdatedAt` DATETIME(3) NULL;

ALTER TABLE `novel_promotion_locations`
  ADD COLUMN `styleAssetId` VARCHAR(191) NULL,
  ADD COLUMN `styleSnapshotName` VARCHAR(191) NULL,
  ADD COLUMN `stylePromptZh` TEXT NULL,
  ADD COLUMN `stylePromptEn` TEXT NULL,
  ADD COLUMN `styleSnapshotUpdatedAt` DATETIME(3) NULL;
