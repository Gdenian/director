-- CreateTable
CREATE TABLE `video_editor_assets` (
    `id` VARCHAR(191) NOT NULL,
    `editorProjectId` VARCHAR(191) NOT NULL,
    `episodeId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `mediaObjectId` VARCHAR(191) NULL,
    `url` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `taskId` VARCHAR(191) NULL,
    `sourceClipIds` TEXT NULL,
    `sourcePanelIds` TEXT NULL,
    `metadata` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `video_editor_project_versions` (
    `id` VARCHAR(191) NOT NULL,
    `editorProjectId` VARCHAR(191) NOT NULL,
    `versionIndex` INTEGER NOT NULL,
    `reason` VARCHAR(191) NOT NULL,
    `summary` TEXT NOT NULL,
    `snapshotJson` TEXT NOT NULL,
    `diffJson` TEXT NULL,
    `createdByTaskId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `video_editor_project_versions_editorProjectId_versionIndex_key`(`editorProjectId`, `versionIndex`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `video_editor_assets_editorProjectId_idx` ON `video_editor_assets`(`editorProjectId`);

-- CreateIndex
CREATE INDEX `video_editor_assets_episodeId_idx` ON `video_editor_assets`(`episodeId`);

-- CreateIndex
CREATE INDEX `video_editor_assets_taskId_idx` ON `video_editor_assets`(`taskId`);

-- CreateIndex
CREATE INDEX `video_editor_project_versions_editorProjectId_idx` ON `video_editor_project_versions`(`editorProjectId`);

-- AddForeignKey
ALTER TABLE `video_editor_assets` ADD CONSTRAINT `video_editor_assets_editorProjectId_fkey` FOREIGN KEY (`editorProjectId`) REFERENCES `video_editor_projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `video_editor_assets` ADD CONSTRAINT `video_editor_assets_episodeId_fkey` FOREIGN KEY (`episodeId`) REFERENCES `novel_promotion_episodes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `video_editor_assets` ADD CONSTRAINT `video_editor_assets_mediaObjectId_fkey` FOREIGN KEY (`mediaObjectId`) REFERENCES `media_objects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `video_editor_project_versions` ADD CONSTRAINT `video_editor_project_versions_editorProjectId_fkey` FOREIGN KEY (`editorProjectId`) REFERENCES `video_editor_projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
