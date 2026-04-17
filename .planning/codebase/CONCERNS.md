# Codebase Concerns

**Analysis Date:** 2026-04-17

## Tech Debt

**任务状态与队列状态存在多套恢复路径:**
- Issue: `Task` 的恢复由 `src/lib/task/service.ts`、`scripts/watchdog.ts`、`src/instrumentation.ts`、`src/lib/workers/shared.ts` 共同处理；`verifyJobAlive` 在 Redis/BullMQ 检查失败时返回 `true`，会继续信任 DB 中的 active 状态。
- Files: `src/lib/task/service.ts`, `scripts/watchdog.ts`, `src/instrumentation.ts`, `src/lib/workers/shared.ts`, `src/lib/task/reconcile.ts`
- Impact: Redis 不可用、BullMQ job 丢失或 worker 异常退出时，`queued`/`processing` 任务可能被误判为仍可恢复；dedupeKey 可能继续挡住新任务，或由 watchdog 二次重入外部 provider。
- Fix approach: 将任务恢复收敛到一个状态机服务；`verifyJobAlive` 的异常结果应显式标记为 `unknown`，由调用方进入限流重试/告警分支，而不是等价于 alive；为 `queued + enqueuedAt != null + BullMQ missing` 增加统一 reconcile。

**Graph Run Runtime 依赖手写 Prisma 模型类型与运行时索引探测:**
- Issue: `src/lib/run-runtime/service.ts` 将 Prisma client 强转为 `GraphRuntimeClient`，并在运行时用 `SHOW INDEX FROM graph_artifacts` 校验唯一索引；`NODE_ENV=test` 跳过索引校验。
- Files: `src/lib/run-runtime/service.ts`, `prisma/schema.prisma`, `scripts/migrations/migrate-graph-artifacts-unique-index.ts`
- Impact: Prisma schema 与手写类型分叉时编译期不报错；测试环境无法发现 `graph_artifacts(runId, stepKey, artifactType, refId)` 缺索引导致的 upsert 竞态；MySQL 专用 `SHOW INDEX` 也让非 MySQL 环境路径脆弱。
- Fix approach: 使用生成的 Prisma 类型和 schema 级迁移校验；把索引断言移到启动健康检查和 CI migration check；为 SQLite/MySQL 分别覆盖集成测试。

**账单默认模式为 OFF:**
- Issue: `src/lib/billing/mode.ts` 在未设置 `BILLING_MODE` 时返回 `OFF`；任务和同步调用在 OFF 模式直接跳过冻结、扣费和影子记录。
- Files: `src/lib/billing/mode.ts`, `src/lib/billing/service.ts`, `src/lib/billing/task-policy.ts`
- Impact: 新环境或配置遗漏时，所有生成调用可免费执行；这会掩盖计费路径错误，也可能造成 provider 成本不可控。
- Fix approach: 生产启动时强制要求 `BILLING_MODE` 显式设置；CI 增加生产配置断言；本地/测试继续允许 `OFF`。

**未知模型可形成零冻结 billable 任务:**
- Issue: `buildTextTaskInfo`、`buildImageTaskInfo`、`buildVideoTaskInfo` 在模型未命中内置定价时保留 `billable: true` 但 `maxFrozenCost: 0`，后续 `withTaskBillingCore` 的 `quotedCost <= 0` 路径会跳过冻结。
- Files: `src/lib/billing/task-policy.ts`, `src/lib/billing/service.ts`, `src/lib/billing/cost.ts`
- Impact: 未配置自定义价格或能力目录的新模型可以进入实际 provider 调用但不预冻结余额；实际成本只有在结算阶段才能发现，失败时没有冻结可回滚。
- Fix approach: 未命中定价时将任务标记为不可提交配置错误，或要求用户 custom pricing 在入队前解析成功；保留 shadow 模式时也写入明确的 `pricing_missing` 记录。

**媒体存储仍处于迁移兼容期:**
- Issue: 媒体值同时支持 `/m/{publicId}`、storage key、签名 URL、旧 JSON 字符串；`src/lib/media/service.ts` 和 `scripts/media-mapping.ts` 保留大量 legacy 字段映射。
- Files: `src/lib/media/service.ts`, `src/lib/media/outbound-image.ts`, `scripts/media-mapping.ts`, `scripts/media-backfill-refs.ts`, `scripts/check-media-normalization.ts`
- Impact: 新代码容易绕过 `MediaObject` 引用直接写 URL/key；删除、归档、出站签名、引用计数和备份脚本需要理解两套格式。
- Fix approach: 所有新写路径只允许写 `mediaId`/`MediaRef`；legacy 字段只读；完成 backfill 后为旧 URL 字段加守卫，禁止新增写入。

**大文件集中承载多种职责:**
- Issue: 多个关键文件超过 500 行并混合路由、校验、状态转换、provider 适配或 UI 状态，例如 `src/app/api/user/api-config/route.ts` 1908 行、`src/lib/run-runtime/service.ts` 1199 行、`src/lib/billing/service.ts` 1080 行、`src/lib/async-poll.ts` 982 行。
- Files: `src/app/api/user/api-config/route.ts`, `src/lib/run-runtime/service.ts`, `src/lib/billing/service.ts`, `src/lib/async-poll.ts`, `src/lib/workers/shared.ts`
- Impact: 改动时难以局部推理；守卫脚本只能约束少数字符串模式，无法覆盖复杂跨模块状态变化。
- Fix approach: 按职责拆分为 schema/validation、state transition、provider adapter、persistence、presentation mapper；拆分前先固定现有契约测试。

## Known Bugs

**公开签名接口可为任意 key 生成重定向:**
- Symptoms: `/api/storage/sign?key=...&expires=...` 不调用 `requireUserAuth` 或项目权限检查，直接对传入 key 调用 `getSignedObjectUrl` 并 redirect。
- Files: `src/app/api/storage/sign/route.ts`, `src/lib/storage/index.ts`, `src/app/api/cos/image/route.ts`
- Trigger: 任何知道或猜到 storage key 的请求都可调用 `/api/storage/sign` 获取短期对象 URL；`expires` 只要求正数，没有最大 TTL。
- Workaround: 不暴露原始 storage key；优先用 `/m/{publicId}`；在修复前不要在日志、API 响应或前端状态中泄漏 key。

**媒体代理路由无归属校验:**
- Symptoms: `/m/{publicId}` 通过 `publicId` 查 `MediaObject` 并代理对象内容，不检查当前用户、项目或引用关系。
- Files: `src/app/m/[publicId]/route.ts`, `src/lib/media/service.ts`, `prisma/schema.prisma`
- Trigger: 任意客户端持有 `publicId` 即可 GET/HEAD 媒体；响应设置 `public, max-age=31536000, immutable`。
- Workaround: 仅把 `/m/{publicId}` 当公开不可撤销链接使用；敏感媒体需要独立私有路由和短 TTL 授权。

**普通登录用户可下载全局日志:**
- Symptoms: `src/app/api/admin/download-logs/route.ts` 只要求 `requireUserAuth`，没有 admin role 或 owner 检查；`readAllLogs` 返回全局日志内容。
- Files: `src/app/api/admin/download-logs/route.ts`, `src/lib/logging/file-writer.ts`, `src/lib/logging/core.ts`
- Trigger: 任意已登录用户请求 `/api/admin/download-logs`。
- Workaround: 在路由层临时关闭或只允许本地访问；正式修复应增加管理员权限模型和审计记录。

**watchdog 重排 processing 任务不会同步回滚或保留 externalId 策略:**
- Symptoms: `scripts/watchdog.ts` 将未超过 `maxAttempts` 的 stale `processing` 任务直接改回 `queued`，不执行账单回滚，也不清理 `externalId`。
- Files: `scripts/watchdog.ts`, `src/lib/workers/utils.ts`, `src/lib/task/service.ts`
- Trigger: worker 心跳超过阈值但 attempt 未达上限；任务重新入队后 `resolveImageSourceFromGeneration`、`resolveVideoSourceFromGeneration`、`resolveLipSyncVideoSource` 会优先恢复已有 `externalId` 并继续轮询。
- Workaround: 外部 provider 保证 `externalId` 可幂等查询时风险较低；否则需要人工检查 provider 侧是否已经扣费或完成。

## Security Considerations

**内部任务身份可伪造到任意用户:**
- Risk: `getInternalTaskSession` 接受 `x-internal-user-id`，只用共享 `INTERNAL_TASK_TOKEN` 验证；token 泄漏后可伪造任意用户会话。非生产且未配置 token 时，只要带 `x-internal-user-id` 即可获得内部 session。
- Files: `src/lib/api-auth.ts`, `src/lib/api-errors.ts`, `src/lib/workers/handlers/llm-proxy.ts`, `src/lib/llm-observe/internal-task.ts`
- Current mitigation: 生产环境未设置 `INTERNAL_TASK_TOKEN` 时拒绝内部 session；worker 调用会附带 token。
- Recommendations: 内部请求只允许来自私网/loopback 或 mTLS；token 绑定服务身份，`userId` 从签名 claims 中解析；非生产路径也应要求显式 opt-in。

**API Key 加密使用固定盐且可回退到 NEXTAUTH_SECRET:**
- Risk: `src/lib/crypto-utils.ts` 使用固定 `SALT`，未设置 `API_ENCRYPTION_KEY` 时使用 `NEXTAUTH_SECRET` 派生密钥；`decryptApiKeyObject` 解密失败时保留原值，可能兼容明文。
- Files: `src/lib/crypto-utils.ts`, `src/lib/api-config.ts`, `src/app/api/user/api-config/route.ts`
- Current mitigation: AES-256-GCM；敏感字段名包含 key/secret 时会加密；日志 redaction 默认覆盖 apiKey、token、secret 等 key。
- Recommendations: 强制生产配置独立 `API_ENCRYPTION_KEY`；支持密钥版本与轮换；解密失败不要静默保留疑似明文；增加数据库扫描脚本识别未加密 provider key。

**日志可能含业务数据和错误堆栈，全局下载权限过宽:**
- Risk: `src/lib/logging/core.ts` 将全局日志写入 `app.log`，worker 失败会记录错误 message、stack、causeChain 和 result details；`src/app/api/admin/download-logs/route.ts` 对所有登录用户开放。
- Files: `src/lib/logging/core.ts`, `src/lib/workers/shared.ts`, `src/app/api/admin/download-logs/route.ts`, `src/lib/logging/redact.ts`
- Current mitigation: `redactValue` 按字段名遮蔽 password/token/apiKey/authorization/cookie/secret；非生产才把 errorStack 放入任务失败 payload。
- Recommendations: 下载日志必须 admin-only；日志 details 不写完整 prompt、URL、provider 响应和用户内容；增加字段值级别的 secret pattern redaction。

**Bull Board 默认仅绑定本机但认证可关闭:**
- Risk: `scripts/bull-board.ts` 在未配置 `BULL_BOARD_USER` 和 `BULL_BOARD_PASSWORD` 时跳过 Basic Auth。
- Files: `scripts/bull-board.ts`, `package.json`
- Current mitigation: 默认 `BULL_BOARD_HOST=127.0.0.1`；启动日志标记 auth enabled/disabled。
- Recommendations: 生产启动要求认证和本地/内网绑定；CI 加启动配置守卫，禁止 `BULL_BOARD_HOST=0.0.0.0` 且无认证。

**本地文件服务依赖路径检查但缺少认证:**
- Risk: `/api/files/[...path]` 只做路径逃逸检查，不做用户权限校验；local storage 模式下任何知道 key 的用户可访问文件。
- Files: `src/app/api/files/[...path]/route.ts`, `src/lib/storage/providers/local.ts`, `src/lib/storage/index.ts`
- Current mitigation: `path.normalize` 防目录穿越；local provider 主要用于本地/开发。
- Recommendations: 生产禁止 `STORAGE_TYPE=local` 或加鉴权；local 文件服务也应通过 `MediaObject`/项目归属授权。

## Performance Bottlenecks

**媒体代理每次请求都经应用服务器转发对象流:**
- Problem: `/m/{publicId}` 先调用 `getSignedUrl`，再由 Next route `fetch` 上游对象并返回 body。
- Files: `src/app/m/[publicId]/route.ts`, `src/lib/storage/index.ts`, `src/lib/storage/providers/minio.ts`
- Cause: 应用层代理保留统一 `/m/` URL，但视频 range 请求和大文件下载都会占用应用 server IO。
- Improvement path: 对可公开媒体使用 302 到短期签名 URL 或 CDN；私有媒体使用边缘鉴权后直连对象存储；为视频 route 增加压测。

**watchdog 批处理固定每轮最多 100 条且串行处理:**
- Problem: `recoverQueuedTasks` 和 `cleanupZombieProcessingTasks` 每轮 `take: 100`，逐条 add/update/publish。
- Files: `scripts/watchdog.ts`
- Cause: 简单串行循环减少竞态，但 backlog 大时恢复速度受 `WATCHDOG_INTERVAL_MS` 限制。
- Improvement path: 增加分页游标、并发上限和任务类型分桶；对超出阈值的积压写入告警。

**出站图片归一化会下载并转换大图:**
- Problem: `src/lib/media/outbound-image.ts` 支持 base64、远程 URL、storage key、`/m/` 路由多种输入，生成前可能 fetch、签名、转 base64。
- Files: `src/lib/media/outbound-image.ts`, `src/lib/media/outbound-image.test.ts`, `scripts/check-outbound-image-success-rate.ts`
- Cause: 为 provider 兼容性集中处理各种输入格式。
- Improvement path: 缓存规范化结果；对最大下载尺寸、MIME、超时和 provider 需求建立硬限制；在批量生成时复用同一图片的归一化结果。

## Fragile Areas

**任务提交补偿和扣费一致性:**
- Files: `src/lib/billing/service.ts`, `src/lib/billing/ledger.ts`, `src/lib/task/service.ts`, `src/lib/workers/shared.ts`, `scripts/billing-cleanup-pending-freezes.ts`, `scripts/billing-reconcile-ledger.ts`
- Why fragile: 任务入队、冻结余额、worker 结算、失败回滚、取消回滚和 watchdog 超时分别在不同模块处理；回滚失败会把任务置为 `BILLING_COMPENSATION_FAILED`，但资金状态仍需人工脚本检查。
- Safe modification: 改动任务生命周期时同步更新 `tests/integration/billing/worker-lifecycle.integration.test.ts`、`tests/regression/task-enqueue-billing-rollback.test.ts`、`tests/concurrency/billing/ledger.concurrency.test.ts`；先运行 `npm run test:billing` 和 `npm run check:task-submit-compensation`。
- Test coverage: 存在账单单元、集成、并发和回归测试；缺口是 watchdog 重排后与外部 provider 已扣费/已完成的组合场景。

**异步外部任务恢复:**
- Files: `src/lib/workers/utils.ts`, `src/lib/async-poll.ts`, `src/lib/async-submit.ts`, `src/lib/task/service.ts`, `scripts/watchdog.ts`
- Why fragile: `externalId` 是避免重复提交 provider 的关键；只有 provider 返回标准 async `externalId` 后才会写入 DB。提交成功但写入 `externalId` 前进程崩溃时，重试会重新提交 provider。
- Safe modification: 所有新 provider 必须返回标准 `PROVIDER:TYPE:REQUEST_ID`；提交外部 API 后应先持久化 externalId，再进入长轮询；补充“提交成功后崩溃”的恢复测试。
- Test coverage: `tests/unit/task/async-poll-external-id.test.ts`、`tests/unit/task/async-poll-openai.test.ts`、`tests/unit/task/async-poll-bailian.test.ts` 覆盖解析与轮询；缺少端到端 provider 提交幂等测试。

**Run Runtime 与 Task Runtime 双轨镜像:**
- Files: `src/lib/run-runtime/service.ts`, `src/lib/run-runtime/task-bridge.ts`, `src/lib/run-runtime/publisher.ts`, `src/lib/workers/shared.ts`, `src/app/api/runs/route.ts`
- Why fragile: 部分 task type 通过 `DIRECT_RUN_EVENT_TASK_TYPES` 直接发布 run event；task SSE event 再映射为 run event。任何 payload 字段变更都会影响 step projection、artifact projection 和前端 run stream。
- Safe modification: 新增或修改事件 payload 字段时先更新 `tests/unit/run-runtime/task-bridge.test.ts`、`tests/integration/run-runtime/reconcile-active-runs.integration.test.ts` 和 `tests/unit/task/publisher.direct-run-events.test.ts`。
- Test coverage: 有 run-runtime 单元和集成测试；缺口是前端断线重连、重复 event、乱序 event 和 `lastSeq` 高并发写入压测。

**Provider 路由守卫依赖字符串扫描:**
- Files: `scripts/guards/no-media-provider-bypass.mjs`, `scripts/guards/no-api-direct-llm-call.mjs`, `scripts/guards/no-provider-guessing.mjs`, `src/lib/generator-api.ts`, `src/lib/model-gateway/router.ts`
- Why fragile: 守卫只扫固定目录和固定正则；新调用点如果使用动态 import、间接 wrapper 或不在扫描目录中，可能绕过统一 gateway、能力目录和计费前置校验。
- Safe modification: 新 provider 调用必须从 `src/lib/generator-api.ts` 或 LLM 统一入口进入；新增脚本时同步扩展 guard scan roots；避免在 API route 直接 import provider SDK。
- Test coverage: `npm run test:guards` 覆盖 guard 行为；缺口是 AST 级别的 provider SDK import 检测。

**模型配置中心和用户自定义模型:**
- Files: `src/app/api/user/api-config/route.ts`, `src/lib/api-config.ts`, `src/lib/model-config-contract.ts`, `scripts/check-model-config-contract.mjs`
- Why fragile: 用户配置同时包含 customProviders、customModels、gatewayRoute、apiMode、compatMediaTemplate、customPricing；API route 文件很大，保存/迁移/展示逻辑耦合。
- Safe modification: 新增配置字段时同步修改 `src/lib/model-config-contract.ts`、`scripts/check-model-config-contract.mjs`、`scripts/check-pricing-catalog.mjs` 和 API route 解析/序列化；避免兼容旧字段降级为纯 modelId。
- Test coverage: 有 model config contract 和 provider integration 测试；缺口是跨版本配置迁移的完整 fixture 矩阵。

**权限边界不统一:**
- Files: `src/lib/api-auth.ts`, `src/app/api/storage/sign/route.ts`, `src/app/m/[publicId]/route.ts`, `src/app/api/admin/download-logs/route.ts`, `src/app/api/assets/*`
- Why fragile: 项目级、用户级、内部任务、公开媒体和 admin 操作使用不同权限入口；部分 route 名称包含 admin/storage 但只做用户级或无鉴权。
- Safe modification: 为 route 定义权限矩阵；所有新 API route 必须显式选择 `requireUserAuth`、`requireProjectAuthLight`、`requireProjectAuth`、public 或 internal，并在 `tests/integration/api/contract` 中覆盖。
- Test coverage: `tests/integration/api/contract/task-infra-routes.test.ts` 存在基础契约；缺少全量 route 权限快照和 admin-only 断言。

## Scaling Limits

**BullMQ 队列与 worker 并发为静态配置:**
- Current capacity: 默认 image worker 并发 20、video worker 并发 4、voice worker 并发 10、text worker 并发 10；队列分为 image/video/voice/text。
- Limit: 单 Redis、单进程 worker 配置下，provider 限流、长轮询和大媒体下载会互相占用同类队列 worker。
- Scaling path: 按 provider/model 拆队列或加 rate limiter；引入分布式 worker autoscaling；将长轮询任务改为 webhook/callback 或专门 poller。

**TaskEvent 与 GraphEvent 持续增长:**
- Current capacity: `prisma/schema.prisma` 为 `TaskEvent` 和 `GraphEvent` 建立索引，但未检测到归档/TTL 删除策略。
- Limit: 长文本 stream、重试和进度事件会增加数据库写放大；事件列表 API 支持单次返回 5000 条。
- Scaling path: 对 stream chunk 做采样/压缩；终态后归档到对象存储；为事件 API 增加 cursor 分页和大小上限。

**全局日志文件和项目日志文件持续增长:**
- Current capacity: `scripts/watchdog.ts` 每小时调用 `cleanupAllProjectLogs`，但全局下载接口仍读取全部日志。
- Limit: 大量 worker 事件和错误堆栈会增大日志文件；下载全量日志会占用内存和响应时间。
- Scaling path: 统一日志轮转、压缩和保留周期；下载接口改为 admin-only + 时间范围 + 流式响应。

## Dependencies at Risk

**COS Storage Provider 未实现:**
- Risk: `CosStorageProvider` 构造函数和所有方法都抛 `StorageProviderNotImplementedError`，但脚本和文档仍出现 COS 备份路径。
- Impact: `STORAGE_TYPE=cos` 会在启动或首次存储调用时失败；`scripts/media-safety-backup.ts` 与 `scripts/media-build-unreferenced-index.ts` 直接使用 COS SDK，和统一 storage provider 分叉。
- Migration plan: 要么实现 `src/lib/storage/providers/cos.ts` 并收敛脚本，要么移除 COS 作为可选 `STORAGE_TYPE` 并让备份脚本只通过 `StorageProvider` 读取。

**OpenAI-compatible 媒体模板依赖用户配置正确性:**
- Risk: `src/lib/generator-api.ts` 对 openai-compatible 媒体模型要求 `compatMediaTemplate`；模板解析和 JSON path 错误会在运行时暴露。
- Impact: 配置错误会导致生成任务失败，若任务已冻结余额则依赖 worker 回滚；若定价缺失则可能无冻结执行。
- Migration plan: 保存配置时运行模板 dry-run 和 schema 校验；把 `scripts/guards/prompt-json-canary-guard.mjs` 类似的静态校验扩展到用户模板 fixture。

**直接 provider SDK/HTTP 调用分散在多个 legacy 模块:**
- Risk: LLM、语音、lip-sync、provider-test 仍有直接 SDK/HTTP 调用，守卫主要覆盖 API route 和媒体 factory bypass。
- Impact: 新增 provider 能力时容易漏掉统一日志、计费、能力目录、错误规范化或密钥解密约束。
- Migration plan: 为所有 provider 交互建立统一 adapter interface；对 `src/lib/providers/*`、`src/lib/generators/*`、`src/lib/llm/*` 增加边界测试。

## Missing Critical Features

**缺少全量 route 权限矩阵:**
- Problem: 无单一文件声明每个 `src/app/api/**/route.ts` 的 auth level、资源归属字段、admin/internal/public 分类。
- Blocks: 自动判断新增 route 是否权限过宽；规划阶段难以快速评估安全影响。

**缺少 provider webhook/callback 消费:**
- Problem: 外部异步任务依赖 worker 长轮询，`src/lib/workers/utils.ts` 默认最长 20 分钟轮询。
- Blocks: 大规模并发视频/音频生成；worker 崩溃后的精确恢复；降低 provider API 查询频率。

**缺少生产配置启动守卫:**
- Problem: `BILLING_MODE`、`INTERNAL_TASK_TOKEN`、`API_ENCRYPTION_KEY`、Bull Board auth、`STORAGE_TYPE` 等关键配置分散在模块中。
- Blocks: 防止生产以开发默认值启动；无法在部署前统一输出风险清单。

## Test Coverage Gaps

**公开媒体与签名路由权限:**
- What's not tested: `/api/storage/sign` 是否要求授权、TTL 上限、key 归属；`/m/{publicId}` 是否符合公开链接策略。
- Files: `src/app/api/storage/sign/route.ts`, `src/app/m/[publicId]/route.ts`, `tests/integration/api`
- Risk: 任意对象 key 或 publicId 泄漏后可被未授权读取。
- Priority: High

**watchdog 与账单/外部 provider 组合场景:**
- What's not tested: stale processing 被 requeue 时，已有 `externalId`、冻结余额、provider 已扣费、provider 已完成但本地未保存结果的组合。
- Files: `scripts/watchdog.ts`, `src/lib/workers/utils.ts`, `src/lib/billing/service.ts`, `tests/integration/task`, `tests/integration/billing`
- Risk: 重复提交、重复扣费、孤儿冻结或任务永久卡住。
- Priority: High

**Admin/ops route 权限:**
- What's not tested: `/api/admin/download-logs`、Bull Board、storage sign 等运维入口的角色权限和生产配置要求。
- Files: `src/app/api/admin/download-logs/route.ts`, `scripts/bull-board.ts`, `src/app/api/storage/sign/route.ts`
- Risk: 日志、队列状态或媒体对象暴露给普通用户。
- Priority: High

**配置中心大 route 的迁移矩阵:**
- What's not tested: `customProviders`、`customModels`、`gatewayRoute`、`apiMode`、`customPricing`、`compatMediaTemplate` 的跨版本保存/读取/迁移组合。
- Files: `src/app/api/user/api-config/route.ts`, `src/lib/api-config.ts`, `scripts/migrations/migrate-model-config-contract.ts`, `scripts/migrations/migrate-custom-pricing-v2.ts`
- Risk: 用户模型配置保存后无法生成、定价缺失、provider 路由错误或密钥解密失败。
- Priority: Medium

**Graph run event 高并发与乱序恢复:**
- What's not tested: 多 worker 同时 `appendRunEventWithSeq`、重复 mirrored event、前端断线后按 `afterSeq` 恢复、lease 过期后事件继续写入。
- Files: `src/lib/run-runtime/service.ts`, `src/lib/run-runtime/publisher.ts`, `src/lib/run-runtime/reconcile.ts`, `tests/integration/run-runtime`
- Risk: run stream UI 显示错误、artifact projection 覆盖异常、active run 误恢复。
- Priority: Medium

---

*Concerns audit: 2026-04-17*
