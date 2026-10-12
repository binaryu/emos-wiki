# 新人入门考核

此目录的 Worker 提供独立考试页面、EMOS 授权回调、服务端评分和萝卜奖励。Wiki 保持原有 Docusaurus 结构，仅在萝卜指南增加考试链接。

## 部署

Worker 名称 `cfwiki`，D1 绑定名称 `DB`。执行 `schema.sql` 创建表。

上传模块：`worker.mjs`（ES Module 主模块）、`questions.mjs`（ES Module）、`index.html`（Text 模块）。

将 `EMOS_MERCHANT_TOKEN` 配置为 Worker secret。不要将凭证写入源码或 GitHub 文件。

## 奖励

每题5分，满分100。60–69分解锁100萝卜；70–89分再解锁180萝卜；90–100分再解锁220萝卜。历史最高分对应累计奖励100、280、500。允许无限次考试，同档和降档不再发奖。

登录通过 `https://emos.best/link` 完成。后端使用 `/api/user/base` 验证回调凭证，忽略回调传入的用户ID；原始用户凭证不持久化。考试会话保存在 D1，通过 HttpOnly Cookie 使用。

发奖通过服务商 `POST /api/pay/transfer`，使用已验证为「lsp娱乐」的凭证。API 文档标注手续费千分之六，以实际扣款为准。

## 转账异常

转账接口没有提供幂等键或按本地流水查询结果的接口。因此请求发出后如超时、响应异常或本地落库失败，不自动再次转账。`payout_state` 为 `unknown`（或执行中断留下的非idle状态）时，管理员应先核对 EMOS 流水，再更新记录。

`payout_target` 记录本次希望达到的累计已发金额。确认款项到账后，将 `reward_paid` 更新为 `payout_target`，状态恢复 `idle` 并清空 `payout_target`；确认未发款后，仅恢复状态并清空目标，保留原已发金额，让用户再次交卷补领。未核对流水前不得复位。

生产验证不得伪造账号或调用转账接口测试。需真实用户完成官方授权并答题，才能验证完整发奖链路。
