// Keep management detail labels identical to the reason text used in Overview.
export const displayMaintenanceGapReason=reason=>String(reason??'')
 .replace(/^L(\d+) · No explicit registration$/,'Level $1 missing')
 .replace(/^L(\d+) · Unrecognized registration.*/,'Level $1 match needs review');
