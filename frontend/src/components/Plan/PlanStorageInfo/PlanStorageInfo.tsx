import { Backup, PlanReplicationSettings } from '../../../@types';
import classes from './PlanStorageInfo.module.scss';

interface PlanStorageInfoProps {
   storage: { name: string; type: string; id: string };
   storagePath: string;
   replicationSettings?: PlanReplicationSettings;
   disableTooltip?: boolean;
   inline?: boolean;
   /** Most recent backup for this plan — used to show each destination's last-known health. */
   latestBackup?: Backup;
}

const formatStatusAge = (timestampMs: number): string => {
   const seconds = Math.floor((Date.now() - timestampMs) / 1000);
   if (seconds < 60) return `${seconds}s ago`;
   const minutes = Math.floor(seconds / 60);
   if (minutes < 60) return `${minutes}m ago`;
   const hours = Math.floor(minutes / 60);
   if (hours < 24) return `${hours}h ago`;
   return `${Math.floor(hours / 24)}d ago`;
};

const OK_COLOR = '#2e7d32';
const FAIL_COLOR = '#c62828';
const UNKNOWN_COLOR = 'var(--secondary-text-color, #888)';

/** Renders a small colored status line for the tooltip's HTML string. */
const statusLine = (statusText: string, color: string): string =>
   `<div style="color: ${color}; font-size: 0.85em; margin-top: 2px;">${statusText}</div>`;

const primaryStatusLine = (latestBackup?: Backup): string => {
   if (!latestBackup) return statusLine('Not yet backed up', UNKNOWN_COLOR);
   if (latestBackup.status === 'completed') return statusLine('✓ Last backup succeeded', OK_COLOR);
   if (latestBackup.status === 'started' || latestBackup.status === 'retrying' || latestBackup.status === 'initializing') {
      return statusLine('Backup in progress', UNKNOWN_COLOR);
   }
   return statusLine(`⚠ Last backup ${latestBackup.status}`, FAIL_COLOR);
};

const mirrorStatusLine = (replicationId: string, latestBackup?: Backup): string => {
   const mirror = latestBackup?.mirrors?.find((m) => m.replicationId === replicationId);
   if (!mirror) return statusLine('Not yet replicated', UNKNOWN_COLOR);
   if (mirror.status === 'failed') return statusLine(`⚠ Replication failed`, FAIL_COLOR);
   if (mirror.status !== 'completed') return statusLine('Replicating...', UNKNOWN_COLOR);
   if (mirror.verificationStatus === 'failed') return statusLine('⚠ Divergence detected', FAIL_COLOR);
   if (mirror.verificationStatus === 'verified' && mirror.lastVerifiedAt) {
      return statusLine(`✓ Verified ${formatStatusAge(mirror.lastVerifiedAt)}`, OK_COLOR);
   }
   return statusLine('Not yet verified', UNKNOWN_COLOR);
};

const PlanStorageInfo = ({
   replicationSettings,
   storage,
   storagePath,
   disableTooltip = true,
   inline = true,
   latestBackup,
}: PlanStorageInfoProps) => {
   return (
      <>
         {replicationSettings && replicationSettings.enabled && replicationSettings.storages.length > 0 ? (
            <div
               className={`${classes.planStorages} ${inline ? classes.inline : ''}`}
               data-tooltip-hidden={disableTooltip}
               data-tooltip-id="htmlToolTip"
               data-tooltip-place="top"
               data-tooltip-html={`
                           <div style="display: flex; flex-direction: column; gap: 8px;">
                           <div>
                              <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
                                 <img style="width: 24px; height: 24px;" src="/providers/${storage?.type}.png" />
                                 <div>
                                    <strong style="display: block;">${storage?.name}</strong>
                                    ${storagePath || '/'}
                                    ${primaryStatusLine(latestBackup)}
                                 </div>
                              </div>
                           </div>
                           ${replicationSettings.storages
                              .slice(0, 3)
                              .map(
                                 (s) => `
                              <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
                                 <img style="width: 24px; height: 24px;" src="/providers/${s?.storageType}.png" />
                                 <div>
                                    <strong style="display: block;">${s?.storageName} (Mirror)</strong>
                                    ${s?.storagePath || '/'}
                                    ${mirrorStatusLine(s.replicationId, latestBackup)}
                                 </div>
                              </div>
                                    `,
                              )
                              .join('')}
                        </div>`}
            >
               <div className={classes.storageWithReplications}>
                  <div className={classes.storageIcons}>
                     <img src={`/providers/${storage?.type}.png`} />
                     {replicationSettings.storages.map((s, index) => (
                        <img key={s.replicationId} src={`/providers/${s.storageType}.png`} style={{ zIndex: 98 - index }} />
                     ))}
                  </div>
                  <div className={classes.storageName}>{replicationSettings.storages.length + 1} Storages</div>
               </div>
            </div>
         ) : (
            <div
               className={`${classes.planStorages} ${inline ? classes.inline : ''}`}
               data-tooltip-hidden={disableTooltip}
               data-tooltip-id="htmlToolTip"
               data-tooltip-place="top"
               data-tooltip-html={`
                           <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
                              <img style="width: 24px; height: 24px;" src="/providers/${storage?.type}.png" />
                              <div>
                                 <strong style="display: block;">${storage?.name}</strong>
                                 ${storagePath || '/'}
                                 ${primaryStatusLine(latestBackup)}
                              </div>
                           </div>
                        `}
            >
               <img src={`/providers/${storage?.type}.png`} />
               <div className={classes.storageName}>{storage?.name}</div>
            </div>
         )}
      </>
   );
};

export default PlanStorageInfo;
