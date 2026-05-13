# AGENTS.md

## 项目概述

基于 oclif v4 的 CLI 工具，二进制名为 `och`。使用 TypeScript + ESM（`"type": "module"`）。

## 常用命令

```bash
pnpm run build          # 编译 TypeScript 到 dist/
pnpm run test           # 运行所有测试（mocha + chai）
pnpm run lint           # ESLint 检查
pnpm run prepack        # 生成 oclif manifest 和 README
```

开发时运行单个命令：`./bin/dev.js <command>`

## 命令顺序

改动代码后应按此顺序验证：`build → test → lint`（test 脚本已通过 posttest 自动执行 lint）。

## 代码结构

- `src/commands/<topic>/<command>.ts` — 命令实现，继承 `@oclif/core` 的 `Command` 类
- `test/commands/<topic>/<command>.test.ts` — 测试文件，使用 `@oclif/test` 的 `runCommand` + `chai`
- `src/index.ts` — 入口，仅导出 `run`
- `bin/dev.js` — 开发模式入口；`bin/run.js` — 生产入口

## 新增命令

1. 在 `src/commands/` 下创建文件或目录（oclif 按文件路径自动注册命令）
2. 在 `test/commands/` 下创建对应的 `.test.ts` 测试文件
3. 测试文件名必须匹配 `test/**/*.test.ts` 模式

## 注释规范

- 注释优先使用**中文**
- 函数使用 JSDoc 注释格式
- 变量使用行内注释 `//`
- 函数内关键逻辑使用行内注释 `//`
- 生成代码时必须按上述规范包含注释

## 注意事项

- 包管理器为 **pnpm**，不要使用 npm 或 yarn
- TypeScript 配置为 `"module": "Node16"`、`"moduleResolution": "node16"`，需使用文件扩展名的相对导入（如 `import foo from './foo.js'`）
- `tsconfig.json` 的 `rootDir` 为 `src`，不要将非源码文件放入 `src/`
- CI 在 ubuntu 和 windows 上跨 Node LTS 版本运行测试，注意路径分隔符兼容性
- 发布流程：推送 main → 自动创建 GitHub Release → 自动发布到 npm
