import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useRealtime,
  useRealtimeConnectionState,
  useRpc,
} from "@bb/plugin-sdk/app";
import type { docksideRpcContract } from "@/server";
import { useRetryingRead } from "@/hooks/use-retrying-read";

export interface ProjectIconsApi {
  /** projectId → icon data URL; absent means "render letters". */
  icons: ReadonlyMap<string, string>;
  isLoading: boolean;
  reload(): void;
}

/**
 * The server's `listProjectIcons` already resolves every project, so the id
 * list only decides when to re-read: a project appearing or disappearing
 * changes the joined key and re-arms the fetch.
 */
export function useProjectIcons(
  projectIds: readonly string[],
): ProjectIconsApi {
  const rpc = useRpc<typeof docksideRpcContract>();
  const [icons, setIcons] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const [isLoading, setIsLoading] = useState(true);
  const requestSequence = useRef(0);
  const idsKey = projectIds.join("");

  const read = useCallback(async () => {
    const sequence = ++requestSequence.current;
    const result = await rpc.call("listProjectIcons", {});
    if (sequence !== requestSequence.current) return;
    setIcons(
      new Map(
        result.icons.map(({ projectId, dataUrl }) => [projectId, dataUrl]),
      ),
    );
    setIsLoading(false);
  }, [rpc]);
  const refresh = useRetryingRead(read);

  useEffect(() => refresh(), [refresh, idsKey]);
  useRealtime("project-icons", () => refresh());

  const connectionState = useRealtimeConnectionState();
  const previousConnectionState = useRef(connectionState);
  useEffect(() => {
    const previous = previousConnectionState.current;
    previousConnectionState.current = connectionState;
    if (previous === "reconnecting" && connectionState === "connected") {
      refresh();
    }
  }, [connectionState, refresh]);

  return useMemo(
    () => ({ icons, isLoading, reload: refresh }),
    [icons, isLoading, refresh],
  );
}
