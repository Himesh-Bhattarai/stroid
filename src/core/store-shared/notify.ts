/**
 * @module store-shared/notify
 *
 * LAYER: Shared types
 * OWNS:  Notification handler indirection for layer decoupling.
 *
 * Consumers: store-write, store-create, store-notify.
 */
type NotifyHandler = (name: string) => void;

let notifyHandler: NotifyHandler | null = null;

export const registerNotifyHandler = (handler: NotifyHandler | null): (() => void) => {
    notifyHandler = handler;
    return () => {
        if (notifyHandler === handler) {
            notifyHandler = null;
        }
    };
};

export const notifyStore = (name: string): void => {
    notifyHandler?.(name);
};
