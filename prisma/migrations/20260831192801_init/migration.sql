-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('active', 'needs_reauth', 'disabled');

-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('uploading', 'processing', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "FileKind" AS ENUM ('video', 'other');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramAccount" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "sessionStringEnc" TEXT NOT NULL,
    "isPremium" BOOLEAN NOT NULL DEFAULT false,
    "storageChannelId" TEXT,
    "status" "AccountStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "File" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "kind" "FileKind" NOT NULL DEFAULT 'other',
    "status" "FileStatus" NOT NULL DEFAULT 'uploading',
    "thumbnailPath" TEXT,
    "durationSeconds" DOUBLE PRECISION,
    "accountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "File_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FilePart" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "partIndex" INTEGER NOT NULL,
    "telegramMessageId" BIGINT NOT NULL,
    "partSizeBytes" BIGINT NOT NULL,
    "byteOffsetStart" BIGINT NOT NULL,

    CONSTRAINT "FilePart_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "FilePart_fileId_idx" ON "FilePart"("fileId");

-- CreateIndex
CREATE UNIQUE INDEX "FilePart_fileId_partIndex_key" ON "FilePart"("fileId", "partIndex");

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TelegramAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilePart" ADD CONSTRAINT "FilePart_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;
