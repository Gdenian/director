ALTER TABLE `global_character_appearances`
  ADD COLUMN `styleAssetId` VARCHAR(191) NULL;

ALTER TABLE `global_locations`
  ADD COLUMN `styleAssetId` VARCHAR(191) NULL;

CREATE INDEX `global_character_appearances_styleAssetId_idx`
  ON `global_character_appearances`(`styleAssetId`);

CREATE INDEX `global_locations_styleAssetId_idx`
  ON `global_locations`(`styleAssetId`);
