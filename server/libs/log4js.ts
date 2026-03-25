import log4js from 'log4js';
import useConfig from '~/server/config';

const logRetentionDays = useConfig().logging.retentionDays;
const logBackups = Math.max(logRetentionDays - 1, 0);

log4js.configure({
    appenders: {
        console: {
            type: 'stdout',
            layout: {
                type: 'colored'
            }
        },
        file: {
            type: 'dateFile',
            filename: 'logs/logs',
            pattern: 'yyyy-MM-dd',
            compress: true,
            alwaysIncludePattern: true,
            numBackups: logBackups
        }
    },
    categories: {
        default: {
            appenders: import.meta.dev ? ['console', 'file'] : ['file'],
            level: import.meta.dev ? 'debug' : 'info'
        }
    }
});

export default function getLogger(name: string) {
    return log4js.getLogger(name);
}
