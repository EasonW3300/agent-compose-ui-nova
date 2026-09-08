import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ConnectionSettings } from '../api/connection';
import { sendRunHumanMessage } from '../api/runs';
import { DASHBOARD_KEY } from './useDashboard';

// React Query owns the asynchronous reply lifecycle and the cache that reflects the resumed run.
// sendRunHumanMessage is the transport boundary; the caller-created ID lets the daemon deduplicate retries.
// DASHBOARD_KEY keeps this mutation aligned with the dashboard query's single canonical key.

export interface RunConversationState {
  /** Send one human reply to the currently waiting conversation. */
  send: (text: string) => Promise<unknown>;
  isSending: boolean;
  error: Error | null;
}

interface ReplyVariables {
  text: string;
  clientMessageId: string;
}

/** Send replies to an interactive run and refresh only views that can show its changed state. */
export function useRunConversation(
  settings: ConnectionSettings,
  runId: string,
): RunConversationState {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ text, clientMessageId }: ReplyVariables) =>
      sendRunHumanMessage(settings, runId, text, clientMessageId),
    onSuccess: async () => {
      // A response changes this run, its timeline, aggregate run/agent lists, and the dashboard.
      // Keep these invalidations after a successful RPC so a rejected reply leaves visible data intact.
      await queryClient.invalidateQueries({ queryKey: ['run', runId], exact: true });
      await queryClient.invalidateQueries({ queryKey: ['run-events', runId], exact: true });
      await queryClient.invalidateQueries({ queryKey: ['runs'], exact: true });
      await queryClient.invalidateQueries({ queryKey: ['agents'], exact: true });
      await queryClient.invalidateQueries({ queryKey: DASHBOARD_KEY, exact: true });
    },
  });

  return {
    // Generate before mutateAsync so any React Query retry for this user action reuses the same daemon ID.
    send: (text) => mutation.mutateAsync({ text, clientMessageId: crypto.randomUUID() }),
    isSending: mutation.isPending,
    error: mutation.error,
  };
}
