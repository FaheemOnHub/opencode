import type { OpenCodeEvent, SessionMessageInfo } from "@opencode/client/promise"
import type { Page } from "@playwright/test"
import { mockWorkspace } from "./workspace"

export const nestedWorkers = {
  root: "ses_workers_root",
  outer: "ses_workers_outer",
  inner: "ses_workers_inner",
}

export async function mockNestedWorkers(page: Page) {
  const messages = (childID?: string): SessionMessageInfo[] => [
    { id: "msg_user", type: "user", text: "Run nested workers", time: { created: 1700000000000 } },
    {
      id: "msg_assistant",
      type: "assistant",
      agent: "build",
      model: { id: "model", providerID: "provider" },
      time: { created: 1700000000001 },
      content: [
        {
          type: "tool",
          id: "call_worker",
          name: childID ? "subagent" : "shell",
          state: {
            status: "running",
            input: childID
              ? { agent: "general", description: childID === nestedWorkers.outer ? "Outer worker" : "Inner worker" }
              : { command: "sleep 120" },
            metadata: childID ? { sessionID: childID } : {},
          },
          time: { created: 1700000000001 },
        },
      ],
    },
  ]

  const workspace = await mockWorkspace(page, {
    name: "NestedWorkers",
    sessions: [
      { id: nestedWorkers.root, title: "Root session" },
      { id: nestedWorkers.outer, title: "Outer worker", parentID: nestedWorkers.root, agent: "general" },
      { id: nestedWorkers.inner, title: "Inner worker", parentID: nestedWorkers.outer, agent: "general" },
      { id: "ses_unrelated_root", title: "Unrelated session" },
      { id: "ses_unrelated_worker", title: "Unrelated worker", parentID: "ses_unrelated_root" },
    ],
    sessionStatus: Object.fromEntries(
      [...Object.values(nestedWorkers), "ses_unrelated_worker"].map((id) => [id, { type: "busy" }]),
    ),
    pageMessages: (id) => ({
      items:
        id === nestedWorkers.root
          ? messages(nestedWorkers.outer)
          : id === nestedWorkers.outer
            ? messages(nestedWorkers.inner)
            : id === nestedWorkers.inner
              ? messages()
              : [],
    }),
    seed: { tabs: [nestedWorkers.root] },
  })

  return {
    ...workspace,
    async finish(sessionID: string, parentID: string) {
      const events: OpenCodeEvent[] = [
        {
          id: `evt_${sessionID}_finished`,
          type: "session.execution.succeeded",
          created: 1700000001000,
          durable: { aggregateID: sessionID, seq: 1, version: 1 },
          location: { directory: workspace.directory },
          data: { sessionID },
        },
        {
          id: `evt_${parentID}_tool_finished`,
          type: "session.tool.success",
          created: 1700000001001,
          durable: { aggregateID: parentID, seq: 1, version: 2 },
          location: { directory: workspace.directory },
          data: {
            sessionID: parentID,
            assistantMessageID: "msg_assistant",
            id: "call_worker",
            content: [{ type: "text", text: "Worker finished" }],
            metadata: {},
            executed: true,
          },
        },
      ]

      await workspace.push(events)
    },
  }
}
