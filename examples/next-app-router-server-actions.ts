import { createStoreForRequest, type RequestScopeCapture } from "../src/server/index.js";
import { createRequestScope } from "../src/server/portable.js";
import { setStore } from "../src/store.js";

export type NextAppRouterState = {
  session: {
    userId: string;
    role: "editor";
    requestId: string;
  };
  draft: {
    body: string;
    revision: number;
    lastSavedBy: string | null;
  };
};

export const renderDraftPage = async (args: {
  userId: string;
  requestId: string;
}): Promise<{
  html: string;
  requestState: RequestScopeCapture<NextAppRouterState>;
}> => {
  const request = createStoreForRequest<NextAppRouterState>(({ create }) => {
    create("session", {
      userId: args.userId,
      role: "editor",
      requestId: args.requestId,
    });
    create("draft", {
      body: `draft:${args.userId}`,
      revision: 0,
      lastSavedBy: null,
    });
  });

  const html = await request.hydrate(async () => {
    await Promise.resolve();
    setStore("draft", (draft) => {
      draft.revision += 1;
    });

    return `<main data-user="${args.userId}" data-request="${args.requestId}">draft:${args.userId}</main>`;
  });

  return {
    html,
    requestState: request.capture(),
  };
};

export const saveDraftAction = async (
  requestState: RequestScopeCapture<NextAppRouterState>,
  body: string,
): Promise<RequestScopeCapture<NextAppRouterState>> => {
  const scope = createRequestScope(requestState);

  return scope.run(async ({ get, set, capture }) => {
    await Promise.resolve();
    const session = get("session");
    if (!session) {
      throw new Error("saveDraftAction requires a session snapshot");
    }

    set("draft", (draft) => {
      draft.body = body;
      draft.revision += 1;
      draft.lastSavedBy = session.userId;
    });

    return capture();
  });
};
