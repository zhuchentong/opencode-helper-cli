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

工具会读取 opencode 的配置文件，支持两种来源：

### 项目级配置

在当前目录向上查找，按优先级依次查找：

- `opencode.json`
- `.opencode.json`

### 全局配置

| 平台 | 路径 |
|------|------|
| Linux | `$XDG_CONFIG_HOME/opencode/opencode.json` 或 `~/.config/opencode/opencode.json` |
| macOS | `~/Library/Application Support/opencode/opencode.json` |
| Windows | `%APPDATA%/opencode/opencode.json` |

配置文件示例（支持 JSONC 注释）：

```jsonc
{
  "plugin": [
    "@scope/plugin-a@1.0.0",         // npm 固定版本
    "@scope/plugin-b@latest",        // npm 最新版本
    "plugin-c@git+https://github.com/user/plugin-c.git"  // git 仓库
  ]
}
```

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
