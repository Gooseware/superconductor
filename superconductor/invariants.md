# Superconductor Invariants Ledger

> Auto-generated audit trail of system invariants and active overrides.

## Active Invariants

| ID | Capability | Path | Track ID | Task ID | Rationale |
|---|---|---|---|---|---|
| `inv-e1294064-2f0b-48b0-bad1-acfea68a2f99` | The core MUST not break | `src/core.ts` | test_track_1786533875326 | task-22693083-9ab5-487a-8d61-9604bb792fa0 | Testing MCP |
| `inv-3ddf5cc4-6f88-4190-a745-ed47951b5bd3` | The core MUST not break | `src/core.ts` | test_track_1786533896417 | task-55d79ace-4ea8-421b-9709-c3de16672372 | Testing MCP |
| `inv-b5b9185a-6671-42b8-94df-84aa6a161899` | Auth component must validate JWT | `src/auth/index.ts` | test_phase4_track | task-65938f08-ac56-490b-83b9-ce82565b266e | - |
| `inv-d4b25a6b-5278-44ab-8178-1f27a922c4ee` | Session validator is active | `src/auth/session.ts` | adv_test_track2 | task-4a221104-9831-4dc0-823e-64d89923cfa1 | - |
| `inv-f93c4f16-0145-42bf-b275-5ec36b9c68a5` | Auth component must validate JWT | `src/auth/index.ts` | adv_test_track | task-ec203da3-53c5-4f7b-822e-9a75ba3f082c | - |
| `inv-ba837543-5d2e-40b1-a33d-07907c1d3cc7` | Auth component must validate JWT | `src/auth/index.ts` | adv_test_track | task-e4ea94ef-2908-4ed9-8f8d-89b40a19fc93 | - |
| `inv-987a26f2-3afb-47d7-9408-9f1c72eba030` | task-status-reporting | `commands/superconductor/status.toml` | - | - | Core orchestrator command for task status. |
| `inv-73977ed5-4913-4e23-9635-6beb0b1b8970` | core-workflow | `superconductor/workflow.md` | - | - | Primary Superconductor workflow definitions. |
| `inv-49ef2064-7a2e-4ea4-a08d-ea73654bd9ee` | task-store-factory | `packages/task-store/src/providers/task-provider-factory.ts` | - | - | The task store provider factory must remain intact. |
| `inv-0ae54c5a-bbbe-4fac-a78f-a42f738a2ab4` | invariant-discovery | `agents/superconductor-invariant-discovery/agent.md` | - | - | Agent responsible for discovering new invariants. |
| `inv-25822fdd-b86b-4735-8efa-3686c080b0b4` | Remove test tracks from registry and filesystem | `superconductor/tracks.md` | clean_test_tracks_20260813 | task-d11b1679-9a3a-431c-9c1e-2bfc193d36f7 | - |
| `inv-d5f8ceb2-f961-460c-be0e-deb0c91198d9` | The core MUST not break | `src/test.ts` | test_track_1788576850379 | task-0b2349f0-2015-4a2c-ad53-59c591b00e30 | Testing MCP |
| `inv-0852fdd2-4898-4fd6-a7a5-3d971f1d296e` | The core MUST not break | `src/test.ts` | test_track_1788577018996 | task-31346c1a-1ac4-4447-91ea-52820478ab28 | Testing MCP |
| `inv-f811497f-267d-40c1-b52e-8896e6edb5c0` | The core MUST not break | `src/test.ts` | test_track_1788577043808 | task-ff7b5f60-e052-45e3-bfed-a9ec289b5c19 | Testing MCP |
| `inv-455f8952-6a4a-4ebe-b54f-5ebc1a3711bb` | The core MUST not break | `src/test.ts` | test_track_1788577061983 | task-b0a61988-e662-4217-a193-766a9116ac91 | Testing MCP |
| `inv-803a8705-e00e-4e18-b76c-e322a801b080` | command-implement | `commands/superconductor/implement.toml` | - | - | Core orchestrator command for track task implementation. |
| `inv-f478031d-9c03-4869-866f-70f4927b83be` | command-newTrack | `commands/superconductor/newTrack.toml` | - | - | Core orchestrator command for initializing new tracks. |
| `inv-f0dd4efb-b1a1-410a-b949-6e02e53169a7` | command-revert | `commands/superconductor/revert.toml` | - | - | Core orchestrator command for reverting track changes. |
| `inv-97c90d74-ce07-44d2-af55-bc961bd4e4c9` | command-review | `commands/superconductor/review.toml` | - | - | Core orchestrator command for reviewer quorum and sign-off. |
| `inv-efc49134-a53b-4e10-9bb7-7eb62148db1d` | command-setup | `commands/superconductor/setup.toml` | - | - | Core orchestrator command for setup and environment validation. |
| `inv-0532747c-4e7f-4bf4-8c8c-16fd83bab41d` | command-yolo | `commands/superconductor/yolo.toml` | - | - | Core orchestrator command for unconstrained execution mode. |
| `inv-efc8dcf1-6b24-40b3-9804-4c685b19bac3` | task_create | `packages/superconductor-kernel/src/index.ts` | - | - | Kernel MCP tool for task creation. |
| `inv-5385ec2f-d91b-4b4a-8e7d-1947b49193f5` | task_update | `packages/superconductor-kernel/src/index.ts` | - | - | Kernel MCP tool for task updates and status transitions. |
| `inv-349b9d1f-118d-4e29-ae22-2875c4429a68` | task_query | `packages/superconductor-kernel/src/index.ts` | - | - | Kernel MCP tool for querying tasks and semantic search. |
| `inv-25543b09-f788-4843-ba60-e1716d54417a` | invariant_query | `packages/superconductor-kernel/src/index.ts` | - | - | Kernel MCP tool for querying invariants. |
| `inv-93739d93-5e22-4368-95d9-28c9188a2d45` | invariant_override | `packages/superconductor-kernel/src/index.ts` | - | - | Kernel MCP tool for overriding invariants. |
| `inv-e2791ad8-3235-47dd-a311-faf44b746969` | task_get_invariants | `packages/superconductor-kernel/src/index.ts` | - | - | Kernel MCP tool for retrieving invariants and active overrides. |
| `inv-dd621d8a-b37b-417d-96db-f865f9812136` | notebook_write | `packages/superconductor-kernel/src/index.ts` | - | - | Kernel MCP tool for notebook writes. |
| `inv-75402cc4-f559-430a-8da7-dc006e2791d9` | notebook_query | `packages/superconductor-kernel/src/index.ts` | - | - | Kernel MCP tool for notebook queries. |
| `inv-a9b0de8b-de46-46fc-808e-b5005b298c71` | notebook_summary | `packages/superconductor-kernel/src/index.ts` | - | - | Kernel MCP tool for notebook summaries. |
| `inv-034b9487-431e-4516-b25b-68520df1ecc5` | kernel_graph_get_node | `packages/superconductor-kernel/src/index.ts` | - | - | Kernel MCP tool for dependency graph node retrieval. |
| `inv-f9d03e5b-3633-4cf1-a27e-3a4f5fc1d4d5` | kernel_policy_get_mode | `packages/superconductor-kernel/src/index.ts` | - | - | Kernel MCP tool for querying policy mode. |
| `inv-54c3719f-b83c-4085-9777-fbb34bf0cd91` | workspace-guard | `packages/superconductor-core/src/orchestration/workspace-guard.ts` | - | - | Core orchestration guard preventing illegal workspace modifications. |
| `inv-c8265619-89d1-4537-8575-67233713049e` | sign-off-gate | `packages/superconductor-core/src/orchestration/sign-off-gate.ts` | - | - | Core orchestration gate for reviewer sign-off consensus. |
| `inv-13075111-8a6b-4044-b672-b04e08d634a8` | quorum-validator | `packages/superconductor-core/src/orchestration/quorum-validator.ts` | - | - | Core orchestration validator enforcing reviewer quorum. |
| `inv-69869fa9-0247-4552-a7a4-d666205960f0` | remediation-orchestrator | `packages/superconductor-core/src/remediation/remediation-orchestrator.ts` | - | - | Core orchestration service for remediating reviewer findings. |
| `inv-421b93b4-bc4e-49c8-9d54-5eb8ace3426c` | checkpoint-orchestrator | `packages/superconductor-core/src/orchestration/checkpoint-orchestrator.ts` | - | - | Core orchestration service for track checkpoints and milestones. |

## Untriaged Invariants

*No untriaged invariants registered.*

## Active Overrides

| ID | Invariant ID | Track ID | Reason | Created At |
|---|---|---|---|---|
| `ovr-b977f1f0-20c3-43e3-ab03-df0af11b9a4f` | `inv-c792a61b-6edb-497e-b1fd-b68fc85396f2` | test_track_1786533932810 | Because test | 2026-08-12T11:25:32.851Z |
| `ovr-268f8018-c3b1-45b6-977d-fdf78bc334c9` | `inv-b3eb066a-cf54-4a1d-813d-f256fdff86ef` | test_track_1786534004641 | Because test | 2026-08-12T11:26:44.742Z |
| `ovr-97f511c4-02d2-44aa-b0e9-b530464a1c8b` | `inv-379fb0af-1bf2-4ae7-aa59-da1217f3ffec` | test_track_1786534007497 | Because test | 2026-08-12T11:26:47.548Z |
| `ovr-197e3660-1fc5-42ce-aa19-d1bf4377fe72` | `inv-174ab4f8-3581-4ebd-b35a-b93152a75be2` | test_track_1786534023254 | Because test | 2026-08-12T11:27:03.348Z |
| `ovr-5a222d95-9d13-4484-8d28-4b5c53993c16` | `inv-e1b82942-3d78-48b3-b973-cc6e7a6cf9f3` | test_track_1786534026030 | Because test | 2026-08-12T11:27:06.137Z |
| `ovr-b3c04e96-74d0-415e-af36-7b44d7648b5e` | `inv-19542a48-3d6d-46cb-b91b-5c0b4df2ecfd` | test_track_1786534030022 | Because test | 2026-08-12T11:27:10.068Z |
| `ovr-b792f8db-bc64-4acd-a226-38f6d76e7591` | `inv-80f08cc8-269e-4773-943f-81d0d8217eac` | test_track_1786534043485 | Because test | 2026-08-12T11:27:23.525Z |
| `ovr-83a4cb2a-935d-4db9-a2b8-41eab12314b7` | `inv-ff20ad56-7b0f-47e0-a07d-ef89e96f5571` | test_track_1786534051665 | Because test | 2026-08-12T11:27:31.713Z |
| `ovr-4740dd92-241f-4319-baf8-fa994f779533` | `inv-7d844a4a-5648-4999-9250-da0fe5dd5ff3` | test_track_1786534126962 | Because test | 2026-08-12T11:28:47.021Z |
| `ovr-83519a86-0840-4a1e-91bd-071b0918f1e9` | `inv-957d980b-3e4f-4b6c-932e-5ebe47118fcb` | test_track_1786534177331 | Because test | 2026-08-12T11:29:37.394Z |
| `ovr-073c1c9b-56ab-48e9-8554-8e4060296d4b` | `inv-d0225de6-09db-4542-a5c2-520e5d4d46b6` | test_track_1786534209884 | Because test | 2026-08-12T11:30:09.932Z |
| `ovr-faa2d1f0-55a8-4a7a-a670-e02ecec76bb7` | `inv-00be5a2c-f24c-4686-84a9-13c98e3bb195` | test_track_1786534328923 | Because test | 2026-08-12T11:32:08.969Z |
| `ovr-8275a070-1755-4135-8c62-3a82244833cb` | `inv-5394e58d-6fd8-449b-aae1-09b1c61a03ac` | test_track_1786534639185 | Because test | 2026-08-12T11:37:19.227Z |
| `ovr-a5744e01-ab4c-4e27-b253-61d017528366` | `inv-b91141e8-d27b-4a16-bd60-fdc1dfec0336` | test_track_1786534664827 | Because test | 2026-08-12T11:37:44.876Z |
| `ovr-48d83f1f-fa90-4249-9e09-b86c1e464f52` | `inv-e45b9c49-84bc-4269-bc7a-dca8c59f28f0` | test_track_1786534807516 | Because test | 2026-08-12T11:40:07.562Z |
| `ovr-92ff9d9a-bd79-4bc2-882f-75d03b21cbb6` | `inv-8eb0167f-f09f-4f83-85cf-15163bec37af` | test_track_1786539271959 | Because test | 2026-08-12T12:54:32.055Z |
| `ovr-98f48577-5c75-42c1-95fc-5143b886e0cb` | `inv-ad5977d3-97bf-4990-9b20-78e93ed95492` | test_track_1786539350400 | Because test | 2026-08-12T12:55:50.587Z |
| `ovr-6afba1ce-87b5-466d-9268-b9ad53b130d0` | `inv-5dc266cf-018d-4e87-990f-fc93f8079b4b` | test_track_1786539642137 | Because test | 2026-08-12T13:00:42.222Z |
| `ovr-d5d80097-88b2-4bb4-b2c8-7892a8f8edd2` | `inv-54a52a97-102a-4595-ab30-1e5dbb2aef3e` | test_track_1786546893976 | Because test | 2026-08-12T15:01:34.040Z |
| `ovr-0304f4e3-9c46-448b-9b09-08ae0539735d` | `inv-43884baa-71d2-45af-bfaf-82196ba46e34` | test_track_1786546903589 | Because test | 2026-08-12T15:01:43.638Z |
| `ovr-7a0f1b10-6e63-4899-857e-9e8f9d306126` | `inv-0e16b68e-bbd8-4a3b-b0de-ccee40458ace` | test_track_1786546923444 | Because test | 2026-08-12T15:02:03.527Z |
| `ovr-ee841dbf-4925-4818-8c32-fbee839d0a25` | `inv-80f5d4e8-f47b-44dc-9d4a-3e390e886cce` | test_track_1786546924331 | Because test | 2026-08-12T15:02:04.387Z |
| `ovr-015c0a45-a7b9-4c99-aca3-029f0ce725f0` | `inv-b14b1e73-04a7-4cda-be1c-baee1eb3cbaa` | test_track_1786546935192 | Because test | 2026-08-12T15:02:15.252Z |
| `ovr-42bb7886-b660-4c0a-8991-01ddee3e33de` | `inv-d3a3241c-087e-4927-b54d-27589850e962` | test_track_1786547213027 | Because test | 2026-08-12T15:06:53.068Z |
| `ovr-a7187daa-7e94-4446-a03a-8de7eb61afd0` | `inv-028c8d97-fea3-488a-b3dc-87eae7a441f5` | test_track_1786547346858 | Because test | 2026-08-12T15:09:06.904Z |
| `ovr-b4979247-c32d-4095-8a0b-fef4dd46d3f0` | `inv-70d6bc2c-fc7f-47cb-af2e-5a5a93e292d6` | test_track_1786547527057 | Because test | 2026-08-12T15:12:07.139Z |
| `ovr-a750c655-95d3-4e2d-baa5-c037cf428dfc` | `inv-bf83ca07-65a5-41b6-a5c2-fbb6c8b6215f` | test_track_1786547562573 | Because test | 2026-08-12T15:12:42.635Z |
| `ovr-0e722142-1dda-4b6c-ab39-a2f2ab680e27` | `inv-b89e0477-3d14-4ce8-9031-f1c7c54c92e6` | test_track_1786547842984 | Because test | 2026-08-12T15:17:23.037Z |
| `ovr-07bfab11-3633-4fc9-b1f8-870b10105003` | `inv-1a4dd06b-670a-4d7d-a231-b0f914f37d19` | test_track_1786547886606 | Because test | 2026-08-12T15:18:06.652Z |
| `ovr-07042996-6a1a-41b2-bb37-5fbb43975029` | `inv-e7b0b1c0-72b2-42ee-b0d9-6559525afa1d` | test_track_1786575547343 | Because test | 2026-08-12T22:59:07.577Z |
| `ovr-bb0b52a6-6614-4006-b2e0-7bc3af9f186d` | `inv-5d6823ae-14b5-4235-8e36-d22714b0393d` | test_track_1786575566986 | Because test | 2026-08-12T22:59:27.056Z |
| `ovr-c99d34a6-a928-461c-85a0-d26903e82221` | `inv-c29581b6-d7d3-4092-98d0-26e09fb1ba38` | test_track_1788576850379 | Because test | 2026-09-05T02:54:10.474Z |
| `ovr-5caee429-acfa-4351-9ad7-e4402fe07399` | `inv-393efca2-b515-42d5-80bf-eb19575da4c7` | test_track_1788577018996 | Because test | 2026-09-05T02:56:59.077Z |
| `ovr-c3065920-34ba-4518-95a1-b04b7b7921e0` | `inv-36dcb4af-dcfc-476e-9531-935504958215` | test_track_1788577043808 | Because test | 2026-09-05T02:57:23.888Z |
| `ovr-6db48ad9-550d-4bd1-a0f9-d84ab485f0aa` | `inv-705df28b-e112-40d3-91b2-c0d29eb0c0de` | test_track_1788577061983 | Because test | 2026-09-05T02:57:42.255Z |

