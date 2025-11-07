# Scratch Editor - 修复版

这是 [Scratch GUI](https://github.com/scratchfoundation/scratch-gui) 的修复版本，用于 MetaSeekOJ 在线判题系统的创意编程教室。

## 主要修复

### 🐛 修复：重复 Sprite 问题

**问题：** 加载项目时出现重复的 Stage 和 Sprite（2个变成4个）

**根本原因：**
- Webpack 热更新（HMR）导致 `vm.loadProject()` 被调用两次
- `vm.clear()` 在某些情况下未能完全清除 targets
- `installTargets()` 被重复调用，导致 targets 累加

**解决方案：**
1. ✅ 添加防重复加载逻辑（缓存 projectId）
2. ✅ 在加载前强制清除 VM 中的所有 targets
3. ✅ 在 `installTargets()` 中检测并清除已有 targets
4. ✅ 在序列化时过滤掉空的默认 Sprite

详细文档：[DUPLICATE_SPRITE_FIX.md](./DUPLICATE_SPRITE_FIX.md)

## 修改的文件

```
packages/
├── scratch-gui/
│   └── src/
│       └── playground/
│           └── render-gui.jsx          # 添加防重复加载逻辑
└── scratch-vm/
    └── src/
        ├── virtual-machine.js          # 添加强制清除和防护
        └── serialization/
            └── sb3.js                  # 过滤默认 Sprite
```

## 快速开始

### 安装依赖

```bash
cd packages/scratch-gui
npm install

cd ../scratch-vm
npm install
```

### 开发模式

```bash
cd packages/scratch-gui
npm start
```

访问：`http://localhost:8601`

### 生产构建

```bash
cd packages/scratch-gui
BUILD_MODE=dist npm run build
```

## 集成到项目

这个 Scratch 编辑器通过 iframe 嵌入到 React 应用中：

```typescript
// OnlineJudgeFE-React/src/pages/creative-classroom/scratch/Editor.tsx
<iframe
  ref={iframeRef}
  src="http://localhost:8601"
  title="Scratch Editor"
  style={{ width: '100%', height: '100%', border: 'none' }}
  onLoad={handleIframeLoad}
/>
```

通过 `postMessage` 进行跨窗口通信：
- 用户登录状态同步
- 项目数据加载/保存
- 截图生成

## 技术栈

- **Scratch GUI**: React 前端界面
- **Scratch VM**: 核心虚拟机
- **Scratch Blocks**: 基于 Blockly 的积木编辑器
- **Webpack**: 模块打包和开发服务器

## 版本信息

- **基于版本**: scratchfoundation/scratch-gui develop 分支
- **修复日期**: 2025-11-07
- **修复者**: 柳老师 & Cursor AI

## 相关链接

- [官方 Scratch GUI](https://github.com/scratchfoundation/scratch-gui)
- [官方 Scratch VM](https://github.com/scratchfoundation/scratch-vm)
- [MetaSeekOJ 项目](https://github.com/sharelgx/MetaSeekOJdev)

## 许可证

继承自 Scratch 官方项目：
- Scratch GUI: BSD-3-Clause
- Scratch VM: BSD-3-Clause

---

**注意：** 这是一个修复版本，专门用于解决在 MetaSeekOJ 项目中遇到的特定问题。如果您也遇到了类似的重复 Sprite 问题，可以参考本仓库的修复方案。
