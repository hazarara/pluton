import { AppError, NotFoundError } from '../utils/AppError';
import { RestoreStore } from '../stores/RestoreStore';
import { RestoreStrategy, RemoteStrategy, LocalStrategy } from '../strategies/restore';
import { PlanStore } from '../stores/PlanStore';
import { BackupStore } from '../stores/BackupStore';
import { StorageStore } from '../stores/StorageStore';
import { BaseRestoreManager } from '../managers/BaseRestoreManager';
import { RestoreConfig, RestoreOptions, BackupSourceComparisonEntry, BackupSourceComparisonResult } from '../types/restores';
import { getSnapshotByTag } from '../utils/restic/restic';

/**
 * A class for managing restore operations.
 */
export class RestoreService {
	constructor(
		protected localAgent: BaseRestoreManager,
		protected planStore: PlanStore,
		protected backupStore: BackupStore,
		protected restoreStore: RestoreStore,
		protected storageStore: StorageStore
	) {}

	getRestoreStrategy(deviceId: string, method: string): RestoreStrategy {
		const isRemote = deviceId !== 'main';
		return isRemote ? new RemoteStrategy(deviceId) : new LocalStrategy(this.localAgent);
	}

	async getAllRestores() {
		const restores = await this.restoreStore.getAll();
		return restores;
	}

	async getRestore(restoreId: string) {
		const restore = await this.restoreStore.getById(restoreId);
		if (!restore) {
			throw new NotFoundError('Restore Item not found.');
		}
		return restore;
	}

	async getRestoreStats(restoreId: string) {
		const restore = await this.restoreStore.getById(restoreId);
		if (!restore) {
			throw new NotFoundError('Restore not found');
		}
		const strategy = this.getRestoreStrategy(restore.sourceId, restore.method);
		const statsRes = await strategy.getRestoreStats(restore.planId as string, restoreId);

		return statsRes;
	}

	async deleteRestore(restoreId: string) {
		const restore = await this.restoreStore.getById(restoreId);
		if (!restore) {
			throw new NotFoundError('Restore not found');
		}

		await this.restoreStore.delete(restoreId);
	}

	async dryRestoreBackup(backupId: string, restoreConfig: RestoreConfig) {
		try {
			const backup = await this.backupStore.getById(backupId);
			if (!backup) {
				throw new Error('Backup not found');
			}
			const restorationInProcess = await this.restoreStore.isRestoreRunning(backupId);
			if (restorationInProcess) {
				throw new Error('A Restoration is already in progress for this Plan');
			}
			const plan = await this.planStore.getById(backup.planId as string);
			if (!plan) {
				throw new Error('Plan not found');
			}
			const backupDevice = backup.sourceId ? backup.sourceId : 'main';
			const storageID = backup.storageId;
			let storagePath = backup.storagePath;

			let storageName = await this.getStorageName(storageID as string);
			const targetPath = restoreConfig.target || '';

			if (restoreConfig.replicationId) {
				const replicationStorage = plan.settings?.replication?.storages.find(
					m => m.replicationId === restoreConfig.replicationId
				);
				if (replicationStorage) {
					storagePath = replicationStorage.storagePath || '';
					storageName = replicationStorage.storageName;
					if (!storageName) {
						storageName = await this.getStorageName(replicationStorage.storageId);
					}
				} else {
					throw new Error('Replication Storage not found');
				}
			}

			const strategy = this.getRestoreStrategy(backupDevice, backup.method);
			const restoreResult = await strategy.getRestoreSnapshotStats(
				backup.planId as string,
				backup.id,
				{
					storageName,
					planId: backup.planId as string,
					storagePath: storagePath || '',
					encryption: backup.encryption || true,
					overwrite: restoreConfig.overwrite,
					target: targetPath,
					delete: restoreConfig.delete,
					includes: restoreConfig.includes,
					excludes: restoreConfig.excludes,
					replicationId: restoreConfig.replicationId,
					sources: plan.sourceConfig?.includes || [],
				}
			);

			if (!restoreResult.success) {
				throw new Error(restoreResult.result || 'Failed to dry restore plan');
			}

			return restoreResult.result;
		} catch (error: any) {
			throw new Error(error?.message || 'Failed to dry restore the backup plan');
		}
	}

	async restoreBackup(backupId: string, restoreConfig: RestoreConfig) {
		try {
			const backup = await this.backupStore.getById(backupId);
			if (!backup) {
				throw new Error('Backup not found');
			}
			const plan = await this.planStore.getById(backup.planId as string);
			if (!plan) {
				throw new Error('Plan not found');
			}
			const restorationInProcess = await this.restoreStore.isRestoreRunning(backupId);
			if (restorationInProcess) {
				throw new Error('A Restoration is already in progress for this Plan');
			}

			const backupDevice = backup.sourceId ? backup.sourceId : 'main';
			const storageID = backup.storageId;
			let storagePath = backup.storagePath;
			let storageName = await this.getStorageName(storageID as string);
			const performanceSettings = plan.settings.performance;

			if (restoreConfig.replicationId) {
				const replicationStorage = plan.settings?.replication?.storages.find(
					m => m.replicationId === restoreConfig.replicationId
				);
				if (replicationStorage) {
					storagePath = replicationStorage.storagePath || '';
					storageName = replicationStorage.storageName;
					if (!storageName) {
						storageName = await this.getStorageName(replicationStorage.storageId);
					}
				} else {
					throw new Error('Replication Storage not found');
				}
			}

			const strategy = this.getRestoreStrategy(backupDevice, plan.method);
			const restoreResult = await strategy.restoreSnapshot(backup.planId as string, backup.id, {
				planId: backup.planId as string,
				storageName: storageName,
				storagePath: storagePath || '',
				encryption: backup.encryption || true,
				overwrite: restoreConfig.overwrite || 'always',
				target: restoreConfig.target || '',
				includes: restoreConfig.includes || [],
				excludes: restoreConfig.excludes || [],
				delete: restoreConfig.delete || false,
				sources: plan.sourceConfig.includes || [],
				performanceSettings,
			});

			if (!restoreResult.success) {
				throw new Error(restoreResult.result || 'Failed to restore plan');
			}

			return restoreResult.result;
		} catch (error: any) {
			throw new Error(error?.message || 'Failed to restore the backup plan');
		}
	}

	async cancelRestore(restoreId: string) {
		const restore = await this.restoreStore.getById(restoreId);
		if (!restore) {
			throw new NotFoundError('Restore not found');
		}
		const strategy = this.getRestoreStrategy(restore.sourceId as string, restore.method);
		const cancelResult = await strategy.cancelSnapshotRestore(restore.planId as string, restoreId);
		await this.restoreStore.update(restoreId, {
			status: 'cancelled',
			inProgress: false,
		});

		return cancelResult;
	}

	async getRestoreProgress(restoreId: string) {
		const restore = await this.restoreStore.getById(restoreId);
		if (!restore) {
			throw new NotFoundError('Restore not found');
		}
		const strategy = this.getRestoreStrategy(restore.sourceId as string, restore.method);
		const progressResult = await strategy.getRestoreProgress(restore.planId as string, restoreId);
		if (!progressResult.success) {
			throw new Error((progressResult.result as string) || 'Failed to get Restore Progress');
		}
		return progressResult.result;
	}

	async getStorageName(storageId: string): Promise<string> {
		let storageName = '';
		if (storageId !== 'local') {
			try {
				const storage = await this.storageStore.getById(storageId);
				if (storage?.name) {
					storageName = storage.name;
				}
			} catch (error: any) {
				return storageName;
			}
		} else {
			storageName = 'local';
		}

		return storageName;
	}

	/**
	 * Compares the snapshot for a given backup across every copy that should
	 * hold it (the primary storage plus each configured replication mirror).
	 * Restic snapshot IDs are content hashes of the snapshot's tree + metadata,
	 * so identical IDs across repos are a strong, cheap (metadata-only) signal
	 * the copies are identical — no data needs to be read to make this check.
	 */
	async compareBackupSources(backupId: string): Promise<BackupSourceComparisonResult> {
		const backup = await this.backupStore.getById(backupId);
		if (!backup) {
			throw new NotFoundError('Backup not found');
		}
		const plan = await this.planStore.getById(backup.planId as string);
		if (!plan) {
			throw new NotFoundError('Plan not found');
		}

		const tag = `backup-${backupId}`;
		const encryption = backup.encryption ?? true;

		const sources: { source: 'primary' | string; storageName: string; storagePath: string }[] = [
			{
				source: 'primary',
				storageName: await this.getStorageName(backup.storageId as string),
				storagePath: (backup.storagePath as string) || '',
			},
			...(plan.settings?.replication?.storages || []).map((mirror) => ({
				source: mirror.replicationId,
				storageName: mirror.storageName,
				storagePath: mirror.storagePath,
			})),
		];

		const entries: BackupSourceComparisonEntry[] = await Promise.all(
			sources.map(async ({ source, storageName, storagePath }) => {
				try {
					const snapshotRes = await getSnapshotByTag(tag, { storageName, storagePath, encryption });
					if (snapshotRes.success && typeof snapshotRes.result === 'object') {
						return {
							source,
							storageName,
							storagePath,
							found: true,
							snapshotId: snapshotRes.result.id,
							tree: snapshotRes.result.tree,
						};
					}
					return {
						source,
						storageName,
						storagePath,
						found: false,
						error: typeof snapshotRes.result === 'string' ? snapshotRes.result : 'Snapshot not found',
					};
				} catch (error: any) {
					return { source, storageName, storagePath, found: false, error: error?.message || 'Unknown error' };
				}
			}),
		);

		// Compare tree hash, not snapshot id: `restic copy` always assigns the
		// destination a brand-new snapshot id (it re-encrypts the snapshot
		// object under the destination repo's key) even for a byte-perfect
		// copy. The tree hash is a pure content hash unaffected by that
		// re-encryption, so it's the correct "do these copies actually match"
		// signal — matching snapshot ids would false-positive on every backup.
		const foundTrees = entries.filter((e) => e.found).map((e) => e.tree);
		const allMatch = entries.every((e) => e.found) && new Set(foundTrees).size === 1;

		return { entries, allMatch };
	}
}
