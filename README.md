# opencode-helper-cli

opencode 辅助 CLI 工具，用于管理 [opencode](https://opencode.ai) 插件。

## 安装

```bash
npm install -g opencode-helper-cli
# 或
pnpm add -g opencode-helper-cli
```

## 使用

```bash
och plugin list            # 列出项目级插件及版本
och plugin list -g         # 列出全局插件及版本
och plugin upgrade         # 升级所有项目级插件
och plugin upgrade -g      # 升级所有全局插件
och plugin upgrade -i      # 交互式选择要升级的插件
och plugin upgrade <name>  # 升级指定插件
och plugin remove <name>   # 删除指定插件
och plugin remove -i       # 交互式选择要删除的插件
och plugin remove -g       # 删除全局插件
```

## 命令

### `och plugin list`

列出 opencode 插件及其当前版本和最新版本。

| 标志 | 缩写 | 说明 |
|------|------|------|
| `--global` | `-g` | 列出全局安装的插件 |

```bash
och plugin list
och plugin list -g
```

输出示例：

```
┌───────────────────────┬────────────┬────────────┐
│ 插件                  │ 当前版本    │ 最新版本    │
├───────────────────────┼────────────┼────────────┤
│ @scope/plugin-a       │ 1.0.0      │ 1.2.0      │
│ plugin-b              │ 未安装      │ 2.0.0      │
└───────────────────────┴────────────┴────────────┘
```

### `och plugin upgrade`

升级 opencode 插件到最新版本。支持 npm 包和 git 仓库两种插件类型。

| 标志 | 缩写 | 说明 |
|------|------|------|
| `--global` | `-g` | 升级全局插件 |
| `--interactive` | `-i` | 交互式选择要升级的插件 |

```bash
och plugin upgrade                          # 升级全部项目级插件
och plugin upgrade -g                       # 升级全部全局插件
och plugin upgrade -i                       # 交互式选择升级
och plugin upgrade @scope/plugin-a          # 升级指定插件
och plugin upgrade foo bar -g               # 升级多个全局插件
```

输出示例：

```
┌───────────────────┬────────────┬────────────┬──────────┐
│ 插件              │ 升级前版本  │ 升级后版本  │ 状态     │
├───────────────────┼────────────┼────────────┼──────────┤
│ @scope/plugin-a   │ 1.0.0      │ 1.2.0      │ ✅ 已升级 │
│ plugin-b          │ —          │ —          │ ⏭️ 跳过   │
└───────────────────┴────────────┴────────────┴──────────┘
```

### `och plugin remove`

删除 opencode 插件，同时从配置文件中移除引用并清理缓存目录。

| 标志 | 缩写 | 说明 |
|------|------|------|
| `--global` | `-g` | 删除全局插件 |
| `--interactive` | `-i` | 交互式选择要删除的插件 |

```bash
och plugin remove <name>                    # 删除指定插件
och plugin remove foo bar                   # 删除多个插件
och plugin remove -g <name>                 # 删除全局插件
och plugin remove -i                        # 交互式选择删除
```

输出示例：

```
即将删除以下插件：plugin-a, plugin-b
? 确认删除？ Yes
┌───────────────┬──────────┬──────────┐
│ 插件          │ 缓存清理  │ 状态     │
├───────────────┼──────────┼──────────┤
│ plugin-a      │ 已清理    │ ✅ 已删除 │
│ plugin-b      │ 无需清理  │ ✅ 已删除 │
└───────────────┴──────────┴──────────┘
```

## 配置文件

工具会读取 opencode 的配置文件，同时兼容 opencode v1（`plugin` 键）与 v2（`plugins` 键）格式：

- 两个键并存时以 `plugin` 为准（对齐 v2 迁移语义：含 v1 键的文件会被整体迁移，字面 `plugins` 被忽略）
- 支持全部条目形态：字符串、`[package, options]` 元组（v1）、`{package, options}` 对象（v2）
- 无法识别的条目会显示为"⚠️ 未识别格式"，删除时原样保留
- 写回时保持原文件的键风格与 JSONC 注释

### 项目级配置

在当前目录向上逐层查找，每层按以下优先级选取（对齐 v2 合并覆盖顺序）：

1. `.opencode/opencode.json`、`.opencode/opencode.jsonc`
2. `opencode.json`、`opencode.jsonc`
3. `.opencode.json`、`.opencode.jsonc`

同一层内若存在声明了 `plugin`/`plugins` 键的文件，则优先选择该文件（避免漏配插件）。

> 与 opencode v2 的差异：v2 会合并所有层级的配置文件，本工具只操作单个文件（就近原则）。

### 全局配置

全局配置目录下的候选文件（取第一个存在的，`opencode.jsonc` 优先级最高）：

- `opencode.jsonc`、`opencode.json`、`config.json`

| 环境 | 配置目录 |
|------|----------|
| `OPENCODE_CONFIG_DIR`（优先） | 直接作为配置目录 |
| `XDG_CONFIG_HOME` | `$XDG_CONFIG_HOME/opencode` |
| 默认（全平台） | `~/.config/opencode` |

> 与 opencode v2 的差异：v2 会合并三个全局文件，本工具只取优先级最高的一个。

### 插件条目格式

```jsonc
{
  "plugin": [
    "@scope/plugin-a@1.0.0",         // npm 固定版本（升级时跳过）
    "@scope/plugin-b@^1.2.0",        // npm 范围（允许升级）
    "plugin-c@latest",               // npm tag（允许升级）
    "plugin-d@git+https://github.com/user/plugin-d.git",  // git 仓库
    "github:user/plugin-e",          // github 简写
    "./local-plugin",                // 本地路径（仅展示，无缓存管理）
    ["plugin-f", {"option": true}],  // v1 元组形式
    {"package": "plugin-g", "options": {}}  // v2 对象形式
  ]
}
```

### 插件缓存

缓存目录与 opencode v2 一致：`~/.cache/opencode/packages/<引用>`（`XDG_CACHE_HOME` 优先；Windows 下目录名中的非法字符会替换为 `_`）。

> 注意：v2 的 git 插件缓存目录名采用原始引用，旧版本 och 生成的 git 插件缓存目录不再被识别（如需可手动清理）。

## 开发

```bash
pnpm install         # 安装依赖
pnpm run build       # 编译 TypeScript
pnpm run test        # 运行测试
pnpm run lint        # ESLint 检查
./bin/dev.js plugin list  # 开发模式运行命令
```

## License

MIT
