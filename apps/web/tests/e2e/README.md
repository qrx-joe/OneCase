# Playwright E2E 测试说明

## 运行条件

- [x] Dev Server 启动 (pnpm dev)
- [x] Playwright 浏览器安装 (chromium-1234)
- [ ] 端口 3000 可用

## 测试场景

### 1. 完整黄金链路
```
1. 打开 http://localhost:3000
2. 点击 "＋ 新建 Intake"
3. 输入: "王主任,我们三栋二单元那个灯又坏了,我妈昨天晚上回来差点摔倒。另外楼下垃圾今天也没人清。"
4. 点击 "AI 整理为事项"
5. 等待 AI 分析完成 (~1s)
6. 验证识别到 2 个事项
7. 验证事项 1: "3栋2单元楼道照明故障" + P2
8. 验证事项 2: "3栋楼下垃圾未及时清运"
9. 点击 "关联此 Case" (事项 1)
10. 点击 "创建新 Case" (事项 2)
11. 验证 Toast 提示
12. 跳转到 Case Detail
13. 验证 Case Number 显示
```

### 2. Demo Mode (网络不可用)
```
1. 断网或设置 AI_PROVIDER=mock
2. 重复上述流程
3. 验证仍可完成演示
```

## 运行命令

```bash
# 安装浏览器
pnpm exec playwright install chromium

# 启动 Dev Server (Terminal 1)
pnpm --filter @onecase/web dev

# 运行 E2E (Terminal 2)
pnpm --filter @onecase/web test:e2e
```

## 当前状态

- ⏸ E2E Test 框架已创建
- ⏸ 等待 Playwright 浏览器下载完成
- ⏸ 预期: 2 个测试场景 (完整链路 + Demo Mode)

## 已知问题

1. **浏览器版本不匹配**: playwright v1.62.1 需要 chromium-1234,当前已安装 1223
2. **端口冲突**: 3000/3001/3002 可能被占用
3. **Prisma 连接**: 静态生成时可能失败,已设置 force-dynamic

## 下一步

1. 等待浏览器下载完成
2. 运行完整 E2E 测试
3. 根据测试结果调整页面逻辑
