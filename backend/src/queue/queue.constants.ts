/**
 * BullMQ queue names used across the app.
 */
export const QUEUE_EMAIL = 'email';
export const QUEUE_PDF = 'pdf';
export const QUEUE_BACKUP = 'backup';

/**
 * Job names (per queue).
 */
export const EMAIL_JOB_SEND = 'send';
export const EMAIL_JOB_FETCH = 'fetch-imap';

export const PDF_JOB_QUOTATION = 'quotation';
export const PDF_JOB_SEND_QUOTATION = 'send-quotation';

export const BACKUP_JOB_EXPORT = 'export';
