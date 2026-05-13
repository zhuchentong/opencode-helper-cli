# och plugin upgrade 命令设计文档

## 概述

为 `och` CLI 添加 `plugin upgrade` 命令，支持升级项目级和全局插件。同时修复跨平台兼容性问题。

## 用法

```bash
och plugin upgrade            # 升级项目级所有可升级插件
och plugin upgrade -g         # 升级全局所有可升级插件
och plugin upgrade foo        # 只升级指定项目级插件
och plugin upgrade foo bar    # 升级多个指定插件
och plugin upgrade foo -g     # 只升级指定的全局插件
```

## 升级逻辑

| 插件类型 | 升级方式 | 固定版本 |
|---------|---------|---------|
| npm（无版本，如 `foo`） | 缓存目录中 `npm install <name>@latest` | — |
| npm（固定版本，如 `foo@1.2.3`） | 跳过，提示固定版本不会升级 | 忽略 |
| git（如 `foo@git+https://...`） | 缓存目录中 `git pull` + `npm install` | — |

## 跨平台兼容性

### 缓存目录与配置目录

按 `process.platform` 返回各系统的标准路径：

| 平台 | 缓存目录 | 全局配置目录 |
|------|---------|------------|
| Linux | `$XDG_CACHE_HOME`（默认 `~/.cache`） | `$XDG_CONFIG_HOME`（默认 `~/.config`） |
| macOS | `~/Library/Caches` | `~/Library/Application Support` |
| Windows | `%LOCALAPPDATA%` | `%APPDATA%` |

### 命令执行

`execFile` 调用需设置 `shell: true`，解决 Windows 上 `npm.cmd` / `git.cmd` 无法直接被 `execFile` 找到的问题。

### git 缓存目录名

当前将 URL 中 `://` 替换为 `:/`，Windows 上 `:` 不能用于目录名。改为替换为 `-`（`://` → `-`），需兼容已有缓存目录（先检查旧路径是否存在）。

## 数据结构

```ts
interface UpgradeResult {
  name: string
  previousVersion: null | string
  currentVersion: null | string
  status: 'failed' | 'skipped' | 'upgraded'
  message?: string
}
```

## 输出格式

```
Plugin                          Previous    Current     Status
@gopowerteam/opencode-commit    1.0.0       1.1.0       upgraded
superpowers                     abc1234     def5678     upgraded
foo@1.0.0                       —           —           skipped (fixed version)
```

## 文件变更

| 文件 | 变更 |
|-----|------|
| `src/services/config.ts` | 提取 `getPlatformConfigDir()`，按平台返回正确配置目录 |
| `src/services/plugin.ts` | 提取 `getPlatformCacheDir()`，按平台返回正确缓存目录；修复 git 缓存目录名编码；新增 `upgradePlugin()`；修复 `execFile` Windows 兼容 |
| `src/commands/plugin/upgrade.ts` | 新建 upgrade 命令 |
| `test/commands/plugin/upgrade.test.ts` | 新建测试 |
