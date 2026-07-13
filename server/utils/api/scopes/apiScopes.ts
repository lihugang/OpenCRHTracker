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
        qqBinding: {
            send: 'api.auth.qq-binding.send',
            verify: 'api.auth.qq-binding.verify',
            unbind: 'api.auth.qq-binding.unbind'
        },
        settings: {
            read: 'api.auth.settings.read',
            write: 'api.auth.settings.write'
        },
        authorizations: {
            read: 'api.auth.authorizations.read',
            revoke: 'api.auth.authorizations.revoke'
        },
        apiKeys: {
            read: 'api.auth.api-keys.read',
            create: 'api.auth.api-keys.create',
            revoke: 'api.auth.api-keys.revoke'
        },
        oauthClients: {
            write: 'api.auth.oauth-clients.write',
            delete: 'api.auth.oauth-clients.delete'
        },
        favorites: {
            read: 'api.auth.favorites.read',
            write: 'api.auth.favorites.write'
        },
        subscriptions: {
            read: 'api.auth.subscriptions.read',
            write: 'api.auth.subscriptions.write'
        }
    },
    search: {
        read: 'api.search.read'
    },
    allocation: {
        emu: {
            read: 'api.allocation.emu.read'
        }
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
            current: {
                read: 'api.timetable.train.current.read'
            },
            circulation: {
                image: {
                    read: 'api.timetable.train.circulation.image.read'
                }
            },
            history: {
                read: 'api.timetable.train.history.read'
            }
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
    notifications: {
        send: 'api.notifications.send'
    },
    debug: {
        echoError: 'api.debug.echo-error'
    }
} as const;
