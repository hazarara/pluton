import { ResticRestoredFile, SnapShotFile } from '../types/restic';
import { Restore } from '../db/schema/restores';

export interface RestoreResItem {
	id: Restore['id'];
	status: Restore['status'];
	error: Restore['errorMsg'];
	stats: Restore['taskStats'];
	planId: Restore['planId'];
	sourceId: Restore['sourceId'];
	sourceType: Restore['sourceType'];
	endedAt: Restore['ended'];
	createdAt: Restore['createdAt'];
	planName: string;
	storage: {
		id: Restore['storageId'];
		path: string;
		name: string;
		type: string;
	};
	deviceName: string;
}

export interface RestoreConfig {
	target: string;
	overwrite: 'always' | 'if-changed' | 'if-newer' | 'never';
	includes: string[];
	excludes: string[];
	delete: boolean;
	storageId?: string;
	replicationId?: string;
	sources?: string[];
}

export interface RestoreStats {
	total_files: number;
	files_restored: number;
	total_bytes: number;
	bytes_restored: number;
}

export type RestoreTaskStats = RestoreStats;

export interface RestoreOptions extends RestoreConfig {
	planId: string;
	storagePath: string;
	storageName: string;
	encryption: boolean;
	sources?: string[];
	performanceSettings?: Record<string, any>;
}

export interface RestoreStatsFile {
	planId: string;
	backupId: string;
	restoreId: string;
	sources: string[];
	config: Record<string, any>;
	sourcePaths: SnapShotFile[];
	restoredPaths: ResticRestoredFile[];
	stats: RestoreStats;
}

/**
 * One available copy of a backup (the primary storage, or one of its
 * replication mirrors) and whether its snapshot for this backup was found.
 */
export interface BackupSourceComparisonEntry {
	source: 'primary' | string; // 'primary', or a replicationId
	storageName: string;
	storagePath: string;
	found: boolean;
	snapshotId?: string;
	error?: string;
}

export interface BackupSourceComparisonResult {
	entries: BackupSourceComparisonEntry[];
	// True only when every entry was found and all found snapshot IDs match exactly.
	// Restic snapshot IDs are content hashes, so a match is a strong, cheap
	// (metadata-only) guarantee the copies are identical.
	allMatch: boolean;
}
