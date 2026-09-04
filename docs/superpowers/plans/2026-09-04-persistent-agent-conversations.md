# Persistent Agent Conversations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an Agent run remain in `WAITING_FOR_INPUT`, preserve its sandbox and provider session, and continue when the user replies from the console.

**Architecture:** The daemon, not the browser, owns the live `agent-compose-runtime stream` interaction. A new unary start/reply API starts a detached conversation and sends reply frames into the retained interaction. The console observes durable run events and logs through existing read APIs, and never needs browser-side bidirectional streaming.

**Tech Stack:** Go 1.24 daemon and Connect RPC, SQLite v2 storage, TypeScript runtime (`agent-compose-runtime`), React 19, TanStack Query, Connect Web, Vitest.

## Global Constraints

- Daemon source root: `/Users/wys3300/Desktop/work_pro/agent-compose`; deployment copy: `/Users/wys3300/Desktop/work_pro/agent-compose-integration/agent-compose`.
- Console source root: `/Users/wys3300/Desktop/work_pro/agent-compose-ui-nova/.worktrees/fluent-ui-redesign`.
- Browser code must use unary and server-streaming Connect Web calls only; it must not call `AttachAgentRun`.
- `StartAgentRun` remains backward-compatible and one-shot; interactive calls use a new RPC.
- No NLP/question-mark heuristic may decide whether a turn needs input; runtime emits an explicit, versioned control state.
- User-initiated cancellation uses existing `CANCELED`; new statuses are `WAITING_FOR_INPUT`, `TIMED_OUT`, and `INTERRUPTED`.
- A waiting sandbox is retained for 24 hours by daemon configuration; timeout, cancellation, failure, completion, and interruption invoke normal cleanup.
- Never expose host files implicitly. Material files must be explicitly uploaded or mounted into `/workspace`.

---

## File Structure

| Root | File | Responsibility |
|---|---|---|
| daemon | `proto/agentcompose/v2/agentcompose.proto` | Status and unary conversation RPC contract |
| daemon | `pkg/model/project_model.go` | Domain statuses and terminal-state predicate |
| daemon | `pkg/runs/conversation_manager.go` | Owns detached runtime interactions and reply queues |
| daemon | `pkg/runs/prompt_attach.go` | Refactor reusable prompt-runtime start/turn handling for manager ownership |
| daemon | `pkg/runs/prompt_projection.go` | Persist user/agent messages and map explicit runtime turn state to runs |
| daemon | `pkg/agentcompose/app/run_controller.go` | Connect delegates for conversation start and reply |
| daemon | `pkg/agentcompose/app/run_supervisor.go` | Register, stop, and recover active conversation runs |
| daemon | `pkg/schedulers/*` | Skip a scheduled trigger while its agent has an active conversation |
| runtime | `runtime/javascript/src/frame.ts` | Frame-level `turnState` contract |
| runtime | `runtime/javascript/src/interactive.ts` | Validate the structured turn envelope and emit `needs_input`/`completed` |
| console | `src/api/projects.ts` and `src/api/runs.ts` | Generated-client wrappers for interactive start and reply |
| console | `src/hooks/useRunConversation.ts` | Query/mutation state for a durable conversation |
| console | `src/ui/RunDetailScreen.tsx` | Conversation transcript and reply UI |
| console | `src/domain/runView.ts`, `src/domain/agentCard.ts` | Waiting-state labels, tones, and active-run predicates |

## Task 1: Define the durable conversation RPC and state contract

**Files:**
- Modify: `/Users/wys3300/Desktop/work_pro/agent-compose/proto/agentcompose/v2/agentcompose.proto`
- Modify: `/Users/wys3300/Desktop/work_pro/agent-compose/pkg/model/project_model.go`
- Modify: `/Users/wys3300/Desktop/work_pro/agent-compose/pkg/agentcompose/api/run_mapper.go`
- Test: `/Users/wys3300/Desktop/work_pro/agent-compose/proto/agentcompose/v2/execution_rpc_contract_test.go`
- Test: `/Users/wys3300/Desktop/work_pro/agent-compose/pkg/agentcompose/api/run_mapper_test.go`

**Interfaces:**
- Produces `RunService.StartInteractiveAgentRun(StartAgentRunRequest)` and `RunService.SendRunHumanMessage(SendRunHumanMessageRequest)`.
- Produces `RunStatus.WAITING_FOR_INPUT`, `RunStatus.TIMED_OUT`, and `RunStatus.INTERRUPTED` plus matching domain constants.

- [ ] **Step 1: Write failing contract and mapping tests**

```go
func TestRunServiceConversationContract(t *testing.T) {
  assertProcedure(t, "RunService", "StartInteractiveAgentRun", false, false)
  assertProcedure(t, "RunService", "SendRunHumanMessage", false, false)
}

func TestProjectRunStatusToProtoWaitsForInput(t *testing.T) {
  if got := ProjectRunStatusToProto(domain.ProjectRunStatusWaitingForInput); got != agentcomposev2.RunStatus_RUN_STATUS_WAITING_FOR_INPUT {
    t.Fatalf("status = %v", got)
  }
}
```

- [ ] **Step 2: Run the focused tests and confirm they fail because the RPC and enum do not exist**

Run: `go test ./proto/agentcompose/v2 ./pkg/agentcompose/api -run 'ConversationContract|WaitsForInput' -count=1`
Expected: compile failure referencing the missing procedures and status.

- [ ] **Step 3: Add append-only proto fields and generated code**

```proto
enum RunStatus {
  // Existing numeric values are unchanged.
  RUN_STATUS_WAITING_FOR_INPUT = 6;
  RUN_STATUS_TIMED_OUT = 7;
  RUN_STATUS_INTERRUPTED = 8;
}

service RunService {
  rpc StartInteractiveAgentRun(StartAgentRunRequest) returns (StartAgentRunResponse);
  rpc SendRunHumanMessage(SendRunHumanMessageRequest) returns (SendRunHumanMessageResponse);
}

message SendRunHumanMessageRequest {
  string run_id = 1;
  string text = 2;
  string client_message_id = 3;
}
message SendRunHumanMessageResponse { RunSummary run = 1; }
```

Run the repository’s checked-in generator command from `Taskfile.yml`, then add domain constants and both proto/domain mapping directions. Keep `CANCELED` as the existing user-stop state.

- [ ] **Step 4: Run focused tests and generator validation**

Run: `go test ./proto/agentcompose/v2 ./pkg/agentcompose/api -run 'ConversationContract|WaitsForInput' -count=1`
Expected: PASS.

- [ ] **Step 5: Commit the protocol slice**

```bash
git add proto/agentcompose/v2 pkg/model/project_model.go pkg/agentcompose/api
git commit -m "feat: define interactive run conversation protocol"
```

## Task 2: Emit explicit per-turn state from the guest runtime

**Files:**
- Modify: `/Users/wys3300/Desktop/work_pro/agent-compose/runtime/javascript/src/frame.ts`
- Modify: `/Users/wys3300/Desktop/work_pro/agent-compose/runtime/javascript/src/interactive.ts`
- Modify: `/Users/wys3300/Desktop/work_pro/agent-compose/runtime/javascript/src/prompt.ts`
- Test: `/Users/wys3300/Desktop/work_pro/agent-compose/runtime/javascript/test/stream.test.ts`
- Test: `/Users/wys3300/Desktop/work_pro/agent-compose/runtime/javascript/test/runners.test.ts`

**Interfaces:**
- Consumes the start frame’s `interactionProtocol: "agent-compose.v1"` flag.
- Produces `agent_turn_completed` frames containing `turnState: "needs_input" | "completed"` and display-safe `finalText`.

- [ ] **Step 1: Write failing runtime tests for valid and invalid control envelopes**

```ts
expect(parseInteractionTurnEnvelope('{"agent_compose":{"state":"needs_input","message":"日志在哪？"}}'))
  .toEqual({ state: "needs_input", message: "日志在哪？" });
expect(() => parseInteractionTurnEnvelope('{"agent_compose":{"state":"other"}}')).toThrow(/state/);
```

- [ ] **Step 2: Run the focused tests and confirm the parser is missing**

Run: `npm test -- --run test/stream.test.ts test/runners.test.ts`
Expected: FAIL with `parseInteractionTurnEnvelope is not defined`.

- [ ] **Step 3: Implement the versioned interaction envelope**

```ts
export type InteractionTurnState = "needs_input" | "completed";
export function parseInteractionTurnEnvelope(raw: string): { state: InteractionTurnState; message: string } {
  const parsed = JSON.parse(raw) as { agent_compose?: { state?: unknown; message?: unknown } };
  const control = parsed.agent_compose;
  if ((control?.state !== "needs_input" && control?.state !== "completed") || typeof control.message !== "string") {
    throw new FrameCodecError("interactive turn must contain agent_compose.state and agent_compose.message");
  }
  return { state: control.state, message: control.message };
}
```

When `interactionProtocol` is set, append a strict system-context instruction requiring the envelope above and pass the matching JSON schema to providers that support structured output. `PromptRunnerInteractiveSession` parses the final provider output, emits only `message` as `finalText`, and includes `turnState`. A malformed envelope emits an `error` frame; it must never be guessed as completion.

- [ ] **Step 4: Run runtime unit tests**

Run: `npm test -- --run test/stream.test.ts test/runners.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit the runtime protocol slice**

```bash
git add runtime/javascript/src runtime/javascript/test
git commit -m "feat: emit explicit interactive turn states"
```

## Task 3: Persist waiting state and project conversation events

**Files:**
- Modify: `/Users/wys3300/Desktop/work_pro/agent-compose/pkg/runs/prompt_projection.go`
- Modify: `/Users/wys3300/Desktop/work_pro/agent-compose/pkg/runs/coordinator.go`
- Modify: `/Users/wys3300/Desktop/work_pro/agent-compose/pkg/projects/project_run.go`
- Test: `/Users/wys3300/Desktop/work_pro/agent-compose/pkg/runs/prompt_projection_test.go`
- Test: `/Users/wys3300/Desktop/work_pro/agent-compose/pkg/runs/coordinator_test.go`

**Interfaces:**
- Consumes runtime `turnState` from Task 2.
- Produces atomic `WAITING_FOR_INPUT` transitions with `USER_MESSAGE`, `AGENT_MESSAGE`, and `STATUS` events.

- [ ] **Step 1: Add failing state-transition tests**

```go
func TestProjectorNeedsInputKeepsRunNonTerminal(t *testing.T) {
  transition := projectTurn(t, `{"type":"agent_turn_completed","turnState":"needs_input","finalText":"日志在哪？"}`)
  if transition.Status != domain.ProjectRunStatusWaitingForInput || !transition.CompletedAt.IsZero() {
    t.Fatalf("transition = %#v", transition)
  }
}

func TestProjectorCompletedMakesRunSucceeded(t *testing.T) { /* same frame with completed */ }
```

- [ ] **Step 2: Run focused tests and confirm `needs_input` is not yet represented**

Run: `go test ./pkg/runs -run 'ProjectorNeedsInput|ProjectorCompleted' -count=1`
Expected: FAIL.

- [ ] **Step 3: Implement explicit transition and idempotent message persistence**

Add `TransitionRequest.ClientMessageID` and persist it in `project_run_event.payload_json`; before appending a user event, query for that ID within the run. Map `needs_input` to a nonterminal coordinator transition with no `CompletedAt`; map `completed` to the existing successful completion path. Emit a `STATUS` event for each state transition.

- [ ] **Step 4: Run focused storage and projector tests**

Run: `go test ./pkg/runs ./pkg/storage/configstore -run 'ProjectorNeedsInput|ProjectorCompleted|ClientMessageID' -count=1`
Expected: PASS.

- [ ] **Step 5: Commit persistent state behavior**

```bash
git add pkg/runs/prompt_projection.go pkg/runs/coordinator.go pkg/projects pkg/storage/configstore
git commit -m "feat: persist waiting conversation turns"
```

## Task 4: Own detached runtime interactions in the daemon

**Files:**
- Create: `/Users/wys3300/Desktop/work_pro/agent-compose/pkg/runs/conversation_manager.go`
- Create: `/Users/wys3300/Desktop/work_pro/agent-compose/pkg/runs/conversation_manager_test.go`
- Modify: `/Users/wys3300/Desktop/work_pro/agent-compose/pkg/runs/prompt_attach.go`
- Modify: `/Users/wys3300/Desktop/work_pro/agent-compose/pkg/agentcompose/app/run_supervisor.go`
- Test: `/Users/wys3300/Desktop/work_pro/agent-compose/pkg/agentcompose/app/run_supervisor_test.go`

**Interfaces:**
- Produces `ConversationManager.Start(context.Context, RunAgentRequest) (ProjectRunRecord, error)`, `Reply(context.Context, runID, text, clientMessageID string) (ProjectRunRecord, error)`, `Stop(runID, reason string)`, and `RecoverInterrupted(context.Context) error`.
- `Reply` accepts only `WAITING_FOR_INPUT` and queues exactly one human frame after an idempotency check.

- [ ] **Step 1: Write a fake-interaction lifecycle test**

```go
func TestConversationSurvivesObserverDisconnectAndResumes(t *testing.T) {
  manager := newManagerWithFakeRuntime(t, turns(needsInput("日志在哪？"), completed("已整理")))
  run := mustStartConversation(t, manager)
  assertStatus(t, run, domain.ProjectRunStatusWaitingForInput)
  run = mustReply(t, manager, run.RunID, "/workspace/log.md", "message-1")
  assertEventuallyStatus(t, manager, run.RunID, domain.ProjectRunStatusSucceeded)
}
```

- [ ] **Step 2: Run it and confirm the manager does not exist**

Run: `go test ./pkg/runs ./pkg/agentcompose/app -run 'ConversationSurvivesObserverDisconnectAndResumes' -count=1`
Expected: compile failure for `ConversationManager`.

- [ ] **Step 3: Refactor attach internals and implement manager ownership**

Extract prompt runtime startup from `runPromptInteractionSession` so it receives a manager-owned input channel instead of an HTTP receiver. Keep `agent-compose-runtime stream` open between turns. The manager owns the context cancel function, interaction, run ID, sandbox ID and 24-hour timer; it does not call `CloseSend` when an HTTP observer disappears. On timeout emit a `TIMED_OUT` transition, cancel the interaction and invoke the existing cleanup path. On daemon startup mark persisted `RUNNING`/`WAITING_FOR_INPUT` conversations `INTERRUPTED` before accepting new replies.

- [ ] **Step 4: Run lifecycle, cancellation, timeout, and restart tests**

Run: `go test ./pkg/runs ./pkg/agentcompose/app -run 'Conversation|Timeout|Interrupted' -count=1`
Expected: PASS.

- [ ] **Step 5: Commit the detached manager**

```bash
git add pkg/runs/conversation_manager.go pkg/runs/conversation_manager_test.go pkg/runs/prompt_attach.go pkg/agentcompose/app/run_supervisor.go
git commit -m "feat: retain interactive agent conversations in daemon"
```

## Task 5: Expose start/reply operations and guard the scheduler

**Files:**
- Modify: `/Users/wys3300/Desktop/work_pro/agent-compose/pkg/agentcompose/app/run_controller.go`
- Modify: `/Users/wys3300/Desktop/work_pro/agent-compose/pkg/agentcompose/api/run_handler.go`
- Modify: `/Users/wys3300/Desktop/work_pro/agent-compose/pkg/schedulers/run_host.go`
- Modify: `/Users/wys3300/Desktop/work_pro/agent-compose/pkg/schedulers/scheduler_run_supervisor.go`
- Test: `/Users/wys3300/Desktop/work_pro/agent-compose/pkg/agentcompose/app/run_controller_test.go`
- Test: `/Users/wys3300/Desktop/work_pro/agent-compose/pkg/schedulers/run_host_test.go`

**Interfaces:**
- Consumes `ConversationManager` from Task 4.
- Produces Connect `StartInteractiveAgentRun` / `SendRunHumanMessage` handlers and `scheduler.skipped_active_conversation` events.

- [ ] **Step 1: Write failing handler and scheduler tests**

```go
func TestSendRunHumanMessageRejectsNonWaitingRun(t *testing.T) {
  _, err := client.SendRunHumanMessage(ctx, connect.NewRequest(&v2.SendRunHumanMessageRequest{RunId: "done", Text: "next", ClientMessageId: "m1"}))
  if connect.CodeOf(err) != connect.CodeFailedPrecondition { t.Fatal(err) }
}

func TestSchedulerSkipsActiveConversation(t *testing.T) {
  result := runScheduledTrigger(t, activeRun(domain.ProjectRunStatusWaitingForInput))
  if !result.Skipped || result.Reason != "active_conversation" { t.Fatalf("%#v", result) }
}
```

- [ ] **Step 2: Run focused tests and confirm handlers/guard are absent**

Run: `go test ./pkg/agentcompose/app ./pkg/schedulers -run 'SendRunHumanMessage|SchedulerSkipsActiveConversation' -count=1`
Expected: FAIL.

- [ ] **Step 3: Implement guarded RPC delegates and scheduler lookup**

Map invalid empty text to `CodeInvalidArgument`, unknown run to `CodeNotFound`, terminal/non-waiting run to `CodeFailedPrecondition`, and duplicate `client_message_id` to the original successful response. Before scheduler sandbox creation, list nonterminal runs for the target project/agent and skip only `RUNNING` or `WAITING_FOR_INPUT` interactive runs; append a status event containing `scheduler.skipped_active_conversation`.

- [ ] **Step 4: Run focused tests and daemon route tests**

Run: `go test ./pkg/agentcompose/app ./pkg/schedulers ./cmd/agent-compose -run 'SendRunHumanMessage|StartInteractive|SchedulerSkipsActiveConversation' -count=1`
Expected: PASS.

- [ ] **Step 5: Commit the public API and scheduling guard**

```bash
git add pkg/agentcompose/app pkg/agentcompose/api pkg/schedulers cmd/agent-compose
git commit -m "feat: expose durable agent conversation controls"
```

## Task 6: Build, migrate, and verify the daemon image

**Files:**
- Test: `/Users/wys3300/Desktop/work_pro/agent-compose/test/e2e/run_completion_restart_host_daemon_test.go`

- [ ] **Step 1: Write an end-to-end fake-runtime test covering start → wait → reply → complete**

```go
func TestInteractiveRunWaitsThenCompletesAfterReply(t *testing.T) {
  run := startInteractiveRun(t, "where is the log?")
  requireStatus(t, run.RunId, v2.RunStatus_RUN_STATUS_WAITING_FOR_INPUT)
  replyRun(t, run.RunId, "/workspace/log.md", "m-1")
  requireStatus(t, run.RunId, v2.RunStatus_RUN_STATUS_SUCCEEDED)
}
```

- [ ] **Step 2: Run the test before image work**

Run: `go test ./test/e2e -run InteractiveRunWaitsThenCompletesAfterReply -count=1`
Expected: PASS after Tasks 1–5; otherwise fix the failing daemon task before continuing.

- [ ] **Step 3: Build the guest runtime and daemon image**

Run: `task image:agent-compose IMAGE_NAME=local/agent-compose-ui:interactive`
Expected: successful image build containing `/usr/bin/agent-compose-runtime`.

- [ ] **Step 4: Recreate only the daemon and verify non-mutating routes**

Run: `docker compose up -d --force-recreate agent-compose` from `/Users/wys3300/Desktop/work_pro/agent-compose-integration/agent-compose`.
Expected: running container, `GET /agentcompose.v2.RunService/StartInteractiveAgentRun` returns `405 Allow: POST`.

- [ ] **Step 5: Commit the end-to-end coverage**

```bash
git add test/e2e/run_completion_restart_host_daemon_test.go
git commit -m "test: verify interactive run lifecycle"
```

## Task 7: Regenerate console protocol clients and API wrappers

**Files:**
- Modify: `/Users/wys3300/Desktop/work_pro/agent-compose-ui-nova/.worktrees/fluent-ui-redesign/proto/agentcompose/v2/agentcompose.proto`
- Modify: `/Users/wys3300/Desktop/work_pro/agent-compose-ui-nova/.worktrees/fluent-ui-redesign/src/api/gen/agentcompose/v2/agentcompose_pb.ts`
- Modify: `/Users/wys3300/Desktop/work_pro/agent-compose-ui-nova/.worktrees/fluent-ui-redesign/src/api/projects.ts`
- Modify: `/Users/wys3300/Desktop/work_pro/agent-compose-ui-nova/.worktrees/fluent-ui-redesign/src/api/runs.ts`
- Test: `/Users/wys3300/Desktop/work_pro/agent-compose-ui-nova/.worktrees/fluent-ui-redesign/src/api/projects.test.ts`
- Test: `/Users/wys3300/Desktop/work_pro/agent-compose-ui-nova/.worktrees/fluent-ui-redesign/src/api/runs.test.ts`

**Interfaces:**
- Consumes daemon proto from Task 1.
- Produces `startInteractiveAgentRun()` and `sendRunHumanMessage()` wrappers.

- [ ] **Step 1: Write failing wrapper tests**

```ts
await startInteractiveAgentRun(s, { projectId: 'p1', agentName: 'a1', prompt: '整理日志' });
expect(startInteractiveMock).toHaveBeenCalledWith({ run: expect.objectContaining({ projectId: 'p1' }) });
await sendRunHumanMessage(s, 'r1', '日志在 /workspace/log.md', 'm1');
expect(sendMessageMock).toHaveBeenCalledWith({ runId: 'r1', text: '日志在 /workspace/log.md', clientMessageId: 'm1' });
```

- [ ] **Step 2: Run focused tests and confirm generated methods are unavailable**

Run: `npm test -- src/api/projects.test.ts src/api/runs.test.ts`
Expected: FAIL until the proto is synced and generated.

- [ ] **Step 3: Sync the daemon proto, regenerate, and implement wrappers**

Run the existing frontend proto generation script. Implement `startInteractiveAgentRun()` with `RunSource.MANUAL` and `sendRunHumanMessage()` with an injected `clientMessageId`; retain `startAgentRun()` for one-shot retry compatibility.

- [ ] **Step 4: Run focused API tests**

Run: `npm test -- src/api/projects.test.ts src/api/runs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit client contract changes**

```bash
git add proto src/api/gen src/api/projects.ts src/api/runs.ts src/api/*.test.ts
git commit -m "feat: add interactive run conversation client"
```

## Task 8: Add waiting-state domain behavior and a reply mutation

**Files:**
- Modify: `/Users/wys3300/Desktop/work_pro/agent-compose-ui-nova/.worktrees/fluent-ui-redesign/src/domain/runView.ts`
- Modify: `/Users/wys3300/Desktop/work_pro/agent-compose-ui-nova/.worktrees/fluent-ui-redesign/src/domain/agentCard.ts`
- Create: `/Users/wys3300/Desktop/work_pro/agent-compose-ui-nova/.worktrees/fluent-ui-redesign/src/hooks/useRunConversation.ts`
- Test: `/Users/wys3300/Desktop/work_pro/agent-compose-ui-nova/.worktrees/fluent-ui-redesign/src/domain/runView.test.ts`
- Test: `/Users/wys3300/Desktop/work_pro/agent-compose-ui-nova/.worktrees/fluent-ui-redesign/src/hooks/useRunConversation.test.tsx`

**Interfaces:**
- Consumes `sendRunHumanMessage()` from Task 7.
- Produces `useRunConversation(settings, runId)` with `{ send, isSending, error }`.

- [ ] **Step 1: Write failing label and mutation tests**

```ts
expect(runStatusLabel(RunStatus.WAITING_FOR_INPUT)).toBe('等待你的回复');
expect(isRunTerminal(RunStatus.WAITING_FOR_INPUT)).toBe(false);
await result.current.send('日志在 /workspace/log.md');
expect(sendMock).toHaveBeenCalledWith(settings, 'r1', '日志在 /workspace/log.md', expect.any(String));
```

- [ ] **Step 2: Run focused tests and confirm the enum is not handled**

Run: `npm test -- src/domain/runView.test.ts src/hooks/useRunConversation.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement domain mappings and idempotent reply mutation**

Map `WAITING_FOR_INPUT` to tone `waiting`, label `等待你的回复`, and nonterminal behavior. In the hook generate one UUID per attempted send, invalidate `['run', runId]`, `['run-events', runId]`, `['runs']`, `['agents']`, and dashboard keys only after a successful response.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- src/domain/runView.test.ts src/hooks/useRunConversation.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit domain and hook work**

```bash
git add src/domain src/hooks
git commit -m "feat: model waiting agent conversations"
```

## Task 9: Build the reply experience in run details

**Files:**
- Modify: `/Users/wys3300/Desktop/work_pro/agent-compose-ui-nova/.worktrees/fluent-ui-redesign/src/ui/RunDetailScreen.tsx`
- Modify: `/Users/wys3300/Desktop/work_pro/agent-compose-ui-nova/.worktrees/fluent-ui-redesign/src/ui/console.css`
- Test: `/Users/wys3300/Desktop/work_pro/agent-compose-ui-nova/.worktrees/fluent-ui-redesign/src/ui/RunDetailScreen.test.tsx`

**Interfaces:**
- Consumes `useRunConversation()` from Task 8 and existing run events/log streams.
- Produces a reply form only for `WAITING_FOR_INPUT` runs.

- [ ] **Step 1: Write failing UI tests**

```tsx
renderDetail(summary(RunStatus.WAITING_FOR_INPUT));
await user.type(screen.getByLabelText('回复助手'), '日志在 /workspace/log.md');
await user.click(screen.getByRole('button', { name: '发送回复' }));
expect(sendMock).toHaveBeenCalled();

renderDetail(summary(RunStatus.SUCCEEDED));
expect(screen.queryByLabelText('回复助手')).not.toBeInTheDocument();
```

- [ ] **Step 2: Run the test and confirm the reply controls are absent**

Run: `npm test -- src/ui/RunDetailScreen.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement accessible conversation controls**

Add a “对话记录” section based on persisted events and retain the diagnostic log section. For `WAITING_FOR_INPUT`, render a labelled textarea, a `发送回复` button, validation for whitespace-only input, inline mutation error, and the existing stop action labelled `结束任务`. Disable send while pending. Do not show controls for `RUNNING`, `SUCCEEDED`, `FAILED`, `CANCELED`, `TIMED_OUT`, or `INTERRUPTED`.

- [ ] **Step 4: Run detail and accessibility tests**

Run: `npm test -- src/ui/RunDetailScreen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit the reply UI**

```bash
git add src/ui/RunDetailScreen.tsx src/ui/RunDetailScreen.test.tsx src/ui/console.css
git commit -m "feat: reply to waiting agent runs"
```

## Task 10: Start interactive tests and surface waiting work across the console

**Files:**
- Modify: `/Users/wys3300/Desktop/work_pro/agent-compose-ui-nova/.worktrees/fluent-ui-redesign/src/ui/CreateWizard.tsx`
- Modify: `/Users/wys3300/Desktop/work_pro/agent-compose-ui-nova/.worktrees/fluent-ui-redesign/src/ui/RunsScreen.tsx`
- Modify: `/Users/wys3300/Desktop/work_pro/agent-compose-ui-nova/.worktrees/fluent-ui-redesign/src/ui/AgentListScreen.tsx`
- Modify: `/Users/wys3300/Desktop/work_pro/agent-compose-ui-nova/.worktrees/fluent-ui-redesign/src/ui/steps/MaterialsStep.tsx`
- Test: `/Users/wys3300/Desktop/work_pro/agent-compose-ui-nova/.worktrees/fluent-ui-redesign/src/ui/CreateWizard.test.tsx`
- Test: `/Users/wys3300/Desktop/work_pro/agent-compose-ui-nova/.worktrees/fluent-ui-redesign/src/ui/RunsScreen.test.tsx`
- Test: `/Users/wys3300/Desktop/work_pro/agent-compose-ui-nova/.worktrees/fluent-ui-redesign/src/ui/AgentListScreen.test.tsx`
- Test: `/Users/wys3300/Desktop/work_pro/agent-compose-ui-nova/.worktrees/fluent-ui-redesign/src/ui/steps/MaterialsStep.test.tsx`

**Interfaces:**
- Consumes `startInteractiveAgentRun()` and waiting-state labels from Tasks 7–8.
- Produces manual test conversations and visible waiting/empty-workspace guidance.

- [ ] **Step 1: Write failing workflow tests**

```tsx
await user.click(screen.getByRole('button', { name: '测试运行一次' }));
expect(startInteractiveMock).toHaveBeenCalled();
expect(startOneShotMock).not.toHaveBeenCalled();
expect(screen.getByText('等待你的回复')).toBeInTheDocument();
expect(screen.getByText(/隔离区默认为空/)).toBeInTheDocument();
```

- [ ] **Step 2: Run focused UI tests and confirm current one-shot behavior fails the expectation**

Run: `npm test -- src/ui/CreateWizard.test.tsx src/ui/RunsScreen.test.tsx src/ui/AgentListScreen.test.tsx src/ui/steps/MaterialsStep.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement console-wide behavior**

Make only “测试运行一次” interactive; retain saving without execution. Add waiting badges to runs and assistants. In the materials step, show a non-dismissable note that `/workspace` starts empty and display the exact destination path for each uploaded/mounted item; do not fabricate access to local files.

- [ ] **Step 4: Run focused UI tests**

Run: `npm test -- src/ui/CreateWizard.test.tsx src/ui/RunsScreen.test.tsx src/ui/AgentListScreen.test.tsx src/ui/steps/MaterialsStep.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit console entry points**

```bash
git add src/ui/CreateWizard.tsx src/ui/RunsScreen.tsx src/ui/AgentListScreen.tsx src/ui/steps src/ui/*.test.tsx
git commit -m "feat: surface waiting agent conversations"
```

## Task 11: Full verification and controlled deployment

**Files:**
- Test: daemon Go suite and runtime JavaScript suite
- Test: console Vitest, lint, and production build

- [ ] **Step 1: Run daemon and runtime verification**

Run: `go test ./pkg/runs ./pkg/agentcompose/app ./pkg/schedulers ./proto/agentcompose/v2 -count=1` from the daemon source root, then `npm test` from `runtime/javascript`.
Expected: both commands exit 0.

- [ ] **Step 2: Run console verification**

Run: `npm test -- --maxWorkers=1 && npm run lint && npm run build` from the console root.
Expected: all tests pass, lint exits 0, and Vite build completes.

- [ ] **Step 3: Build and restart only the daemon service**

Run: `task image:agent-compose IMAGE_NAME=local/agent-compose-ui:interactive` followed by `docker compose up -d --force-recreate agent-compose`.
Expected: `agent-compose` is running with zero restarts and the configured GHCR guest image remains selected.

- [ ] **Step 4: Manual acceptance script**

1. Create a Claude assistant with an explicitly uploaded or mounted test log under `/workspace/materials`.
2. Click “测试运行一次”; verify it asks a question and becomes “等待你的回复”, not “已完成”.
3. Refresh the run detail page; verify the reply box and transcript remain.
4. Reply with the material path; verify the same run returns to “正在工作” and eventually succeeds only after the `completed` control event.
5. Trigger the schedule while waiting; verify no second sandbox/run is created and a skip event appears.

- [ ] **Step 5: Commit and push each repository separately after verification**

```bash
git -C /Users/wys3300/Desktop/work_pro/agent-compose status --short
git -C /Users/wys3300/Desktop/work_pro/agent-compose-ui-nova/.worktrees/fluent-ui-redesign status --short
```

Push only the reviewed source branches; do not commit the deployment workspace’s `.env`, data directory, or generated runtime state.
