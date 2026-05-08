import { useMemo } from 'react';

type AlertVariant = 'info' | 'success' | 'warning' | 'danger';

interface AddAlertOption {
    name?: string;
    variant?: AlertVariant;
    duration?: number;
    description?: React.ReactNode;
    nonDismissable?: boolean;
    debugMessage?: string;
}

/**
 * Standalone stub of the GO `useAlert` hook.
 * Logs alerts to the console instead of rendering them.
 * Mirrors the signature of `#hooks/useAlert` so submodule code works unchanged.
 * Modify this as needed as long as the signature matches.
 */
function useAlert() {
    return useMemo(() => ({
        show: (title: React.ReactNode, options?: AddAlertOption): string => {
            const name = options?.name ?? `alert-${Math.random().toString(36).slice(2, 10)}`;
             
            console.warn('[useAlert stub]', {
                name,
                variant: options?.variant ?? 'info',
                title,
                description: options?.description,
                debugMessage: options?.debugMessage,
                duration: options?.duration,
                nonDismissable: options?.nonDismissable ?? false,
            });
            return name;
        },
    }), []);
}

export default useAlert;
