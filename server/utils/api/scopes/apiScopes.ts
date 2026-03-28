export const API_SCOPES = {
    admin: 'api.admin',
    config: {
        read: 'api.config.read'
    },
    auth: {
        me: 'api.auth.me.read',
        logout: 'api.auth.logout',
        password: {
            update: 'api.auth.password.update'
        },
        apiKeys: {
            read: 'api.auth.api-keys.read',
            create: 'api.auth.api-keys.create',
            revoke: 'api.auth.api-keys.revoke'
        }
    },
    search: {
        read: 'api.search.read'
    },
    records: {
        daily: {
            read: 'api.records.daily.read'
        }
    },
    history: {
        train: {
            read: 'api.history.train.read'
        },
        emu: {
            read: 'api.history.emu.read'
        }
    },
    timetable: {
        train: {
            read: 'api.timetable.train.read'
        },
        station: {
            read: 'api.timetable.station.read'
        }
    },
    exports: {
        daily: {
            read: 'api.exports.daily.read'
        }
    },
    feedback: {
        read: 'api.feedback.read',
        create: 'api.feedback.create',
        reply: 'api.feedback.reply',
        manage: 'api.feedback.manage'
    },
    debug: {
        echoError: 'api.debug.echo-error'
    }
} as const;
