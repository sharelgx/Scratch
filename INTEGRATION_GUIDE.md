# Scratch Editor 集成开发指南

> 完整的 Scratch 编辑器集成文档，适用于将 Scratch GUI 嵌入到自定义应用中

## 📖 目录

1. [架构概览](#架构概览)
2. [官方架构分析](#官方架构分析)
3. [集成方案](#集成方案)
4. [用户认证集成](#用户认证集成)
5. [项目数据管理](#项目数据管理)
6. [常见问题与解决方案](#常见问题与解决方案)
7. [最佳实践](#最佳实践)

---

## 架构概览

### 官方组件层次

```
┌─────────────────────────────────────────────────────────┐
│                   scratch-www (网站系统)                  │
│  - 用户认证 (session management)                         │
│  - 项目数据存储                                          │
│  - 社区功能                                              │
└────────────────────┬────────────────────────────────────┘
                     │ 通过 props 传递
                     ↓
┌─────────────────────────────────────────────────────────┐
│              scratch-gui (编辑器 UI 组件库)               │
│  - 纯 UI 组件（无认证逻辑）                              │
│  - 通过 props 接收: username, accountMenuOptions         │
│  - Redux store (不包含 session)                          │
└────────────────────┬────────────────────────────────────┘
                     │ 通过 vm.postIOData
                     ↓
┌─────────────────────────────────────────────────────────┐
│              scratch-vm (核心虚拟机)                      │
│  - 项目运行引擎                                          │
│  - 积木块执行逻辑                                        │
│  - 精灵、舞台管理                                        │
└─────────────────────────────────────────────────────────┘
```

### MetaSeekOJ 集成架构

```
┌─────────────────────────────────────────────────────────┐
│          OnlineJudgeFE-React (父窗口)                    │
│  - Editor.tsx: React 组件                                │
│  - 用户认证 API 调用                                     │
│  - 项目 CRUD 操作                                        │
│  - window.__scratchUserInfo                             │
└────────────────────┬────────────────────────────────────┘
                     │ postMessage 通信
                     │ (iframe 嵌入)
                     ↓
┌─────────────────────────────────────────────────────────┐
│         Scratch Editor iframe (http://localhost:8601)   │
│  - render-gui.jsx: 启动脚本                              │
│  - 监听 USER_INFO_UPDATE 消息                            │
│  - 读取 window.__scratchUserInfo                         │
│  - 传递 username prop 给 GUI                             │
└────────────────────┬────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────┐
│                   Scratch VM                             │
│  - 通过 vm.postIOData('userData', {username})            │
└─────────────────────────────────────────────────────────┘
```

---

## 官方架构分析

### 1. 用户信息传递流程

#### 官方实现 (scratch-www → scratch-gui)

**步骤1**: scratch-www 通过 Redux state 管理 session

```javascript
// scratch-www 中的 state
state.session = {
  session: {
    user: {
      username: 'user123',
      thumbnailUrl: 'https://...'
    }
  },
  permissions: {
    educator: false,
    student: true
  }
}
```

**步骤2**: 通过 props 传递给 scratch-gui

```jsx
// scratch-www 渲染 GUI
<GUI
  username={state.session.session.user.username}
  accountMenuOptions={{
    canHaveSession: true,
    avatarUrl: state.session.session.user.thumbnailUrl,
    myStuffUrl: '/mystuff/',
    profileUrl: `/users/${username}`
  }}
/>
```

**步骤3**: vm-listener-hoc.jsx 监听 props 变化

```javascript
// packages/scratch-gui/src/lib/vm-listener-hoc.jsx
componentDidMount() {
  this.props.vm.postIOData('userData', {username: this.props.username});
}

componentDidUpdate(prevProps) {
  if (prevProps.username !== this.props.username) {
    this.props.vm.postIOData('userData', {username: this.props.username});
  }
}
```

**关键点：**
- ✅ scratch-gui **不管理** session，只接收 props
- ✅ username 变化时自动通知 VM
- ✅ React 生命周期自动处理更新

### 2. menu-bar 的 Redux 映射

```javascript
// packages/scratch-gui/src/components/menu-bar/menu-bar.jsx
const mapStateToProps = (state, ownProps) => {
  const user = state.session && state.session.session && state.session.session.user;
  const permissions = state.session && state.session.permissions;
  
  return {
    username: ownProps.username ?? (user ? user.username : null),
    accountMenuOptions: ownProps.accountMenuOptions ?? {
      canHaveSession: sessionExists ?? false,
      avatarUrl: user?.thumbnailUrl,
      myStuffUrl: '/mystuff/',
      profileUrl: user && `/users/${user.username}`,
      // ...
    }
  };
};
```

**关键点：**
- ✅ 优先使用 `ownProps`（从父组件传入）
- ✅ 回退到 Redux state（如果在 scratch-www 环境中）
- ✅ 支持两种集成方式

### 3. 独立运行模式 (Standalone)

```javascript
// packages/scratch-gui/src/playground/render-gui-standalone.jsx
export default appTarget => {
  setAppElement(appTarget);
  
  const state = new EditorState({
    showTelemetryModal: simulateScratchDesktop
  });
  
  const gui = createStandaloneRoot(state, appTarget, {
    wrappers: [HashParserHOC]
  });
  
  gui.render({
    canEditTitle: true,
    backpackVisible: true,
    canSave: false,
    // 注意：没有传 username，处于未登录状态
    onClickLogo
  });
};
```

**关键点：**
- ✅ 使用 `EditorState` 创建独立的 Redux store
- ✅ 不包含 session reducer
- ✅ 适合独立运行或嵌入到第三方应用

---

## 集成方案

### 方案对比

| 方案 | 优点 | 缺点 | 适用场景 |
|------|------|------|----------|
| **npm 包集成** | 完全控制、类型安全 | 构建复杂、体积大 | 大型项目 |
| **iframe 嵌入** | 隔离、简单、独立更新 | 通信开销、样式限制 | 中小型项目 |
| **monorepo** | 统一管理、共享依赖 | 配置复杂 | 企业级项目 |

### 当前方案：iframe 嵌入 + postMessage

#### 优势
1. ✅ **开发隔离**：Scratch 编辑器独立运行，不污染主应用
2. ✅ **快速迭代**：修改 Scratch 代码无需重新构建主应用
3. ✅ **安全隔离**：防止 Scratch 代码影响主应用
4. ✅ **独立部署**：可以独立更新 Scratch 版本

#### 劣势
1. ❌ **通信复杂**：需要通过 postMessage 传递数据
2. ❌ **调试困难**：两个上下文，需要分别调试
3. ❌ **性能开销**：iframe 创建和消息传递有开销

---

## 用户认证集成

### 问题分析

**官方设计：**
```
scratch-www (管理 session) → GUI (接收 props) → VM (接收 userData)
```

**我们的实现：**
```
Editor.tsx (API 调用) → window.__scratchUserInfo (全局状态)
                      ↓
                postMessage → iframe (render-gui.jsx) → GUI (props) → VM
```

**核心问题：**
- ❌ 多了一层 `window.__scratchUserInfo` 全局状态
- ❌ 需要手动同步 React state → global → iframe → React props
- ❌ 时序问题：iframe 渲染早于 API 返回

### 官方推荐做法

#### 方式1：直接传递 props（最佳）

如果使用 npm 包集成：

```tsx
// 直接在 React 组件中使用
import GUI from 'scratch-gui';

function ScratchEditor() {
  const [username, setUsername] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  
  useEffect(() => {
    // 获取用户信息
    fetch('/api/profile/').then(res => res.json()).then(data => {
      setUsername(data.username);
      setAvatarUrl(data.avatar);
    });
  }, []);
  
  return (
    <GUI
      username={username}
      accountMenuOptions={{
        canHaveSession: true,
        avatarUrl: avatarUrl,
        canLogin: !username,
        canLogout: !!username
      }}
    />
  );
}
```

**优点：**
- ✅ 符合官方设计
- ✅ React 自动处理更新
- ✅ 无需手动同步

**缺点：**
- ❌ 需要将 scratch-gui 打包到主应用（体积大）

#### 方式2：iframe + 延迟渲染（我们当前的优化方案）

```typescript
// Editor.tsx (父窗口)
useEffect(() => {
  // 1. 立即初始化全局状态（给 iframe 一个初始值）
  window.__scratchUserInfo = {
    isLoggedIn: false,
    username: null,
    avatarUrl: null
  };
  
  // 2. 异步获取真实用户信息
  checkLoginStatus();
}, []);

const checkLoginStatus = async () => {
  const response = await fetch('/api/profile/', { credentials: 'include' });
  if (response.ok) {
    const data = await response.json();
    const userInfo = {
      isLoggedIn: true,
      username: data.username,
      avatarUrl: data.avatar
    };
    
    // 3. 立即更新全局状态（不等 React state）
    window.__scratchUserInfo = userInfo;
    
    // 4. 通知 iframe
    if (iframeLoaded) {
      iframeRef.current.contentWindow.postMessage({
        type: 'USER_INFO_UPDATE',
        data: userInfo
      }, 'http://localhost:8601');
    }
    
    // 5. 更新 React state（用于 UI 显示）
    setUsername(data.username);
    setAvatarUrl(data.avatar);
    setIsLoggedIn(true);
  }
};
```

```javascript
// render-gui.jsx (iframe 内)
// 1. 延迟渲染，等待 window.__scratchUserInfo 初始化
const isInIframe = window.parent && window.parent !== window;

if (isInIframe) {
  let attempts = 0;
  const checkAndRender = () => {
    attempts++;
    const hasUserInfo = window.__scratchUserInfo && 
                        (window.__scratchUserInfo.isLoggedIn !== undefined);
    
    if (hasUserInfo || attempts >= 5) {
      renderApp();
    } else {
      setTimeout(checkAndRender, 100);
    }
  };
  
  setTimeout(checkAndRender, 100);
} else {
  renderApp();
}

// 2. 监听 postMessage 更新
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'USER_INFO_UPDATE') {
    window.__scratchUserInfo = event.data.data;
    renderApp(); // 重新渲染
  }
});

// 3. renderApp 读取最新状态
const renderApp = () => {
  const userInfo = window.__scratchUserInfo || {
    isLoggedIn: false,
    username: null,
    avatarUrl: null
  };
  
  root.render(
    <WrappedGui
      username={userInfo.username}
      accountMenuOptions={{
        canHaveSession: true,
        canLogin: !userInfo.isLoggedIn,
        canLogout: userInfo.isLoggedIn,
        avatarUrl: userInfo.avatarUrl
      }}
    />
  );
};
```

**优点：**
- ✅ 保持 iframe 隔离
- ✅ 解决时序问题
- ✅ 支持动态更新

**缺点：**
- ❌ 实现复杂
- ❌ 需要手动同步状态

### 最佳实践建议

#### 🎯 短期方案（当前 iframe 架构）

1. **简化全局状态管理**
   - 使用 `window.__scratchUserInfo` 作为**唯一真实来源**
   - Editor.tsx 的 React state 只用于 UI 显示
   - 所有通信都基于 `window.__scratchUserInfo`

2. **统一更新流程**
   ```typescript
   // 统一的更新函数
   const updateUserInfo = (userInfo) => {
     // 1. 更新全局状态（真实来源）
     window.__scratchUserInfo = userInfo;
     
     // 2. 更新 React state（UI 显示）
     setUsername(userInfo.username);
     setAvatarUrl(userInfo.avatarUrl);
     setIsLoggedIn(userInfo.isLoggedIn);
     
     // 3. 通知 iframe（如果已加载）
     if (iframeLoaded) {
       sendUserInfoToIframe();
     }
   };
   ```

3. **iframe 延迟渲染**
   - 等待 `window.__scratchUserInfo` 初始化（最多 500ms）
   - 监听 `USER_INFO_UPDATE` 消息触发重新渲染

#### 🚀 长期方案（推荐迁移）

**方案A：npm 包集成**

```bash
# 1. 安装依赖
npm install scratch-gui@latest

# 2. 直接在 React 组件中使用
import GUI from 'scratch-gui';
```

**优点：**
- 完全符合官方设计
- 类型安全
- 无通信开销

**迁移成本：中等**

**方案B：使用官方的 embedding API**

等待 [scratch-editor](https://github.com/scratchfoundation/scratch-editor) 官方提供的嵌入 API。

---

## 项目数据管理

### VM 加载项目的内部流程

```javascript
// virtual-machine.js
loadProject(projectData) {
  return this.deserializeProject(projectData, null);
}

deserializeProject(projectJSON, zip, loadOptions) {
  // 1. 清除现有项目（关键！）
  this.clear();  
  
  // 2. 反序列化项目数据
  const {targets, extensions} = sb3.deserialize(projectJSON, this.runtime, zip, loadOptions);
  
  // 3. 安装 targets（精灵和舞台）
  return this.installTargets(targets, extensions, true);
}

installTargets(targets, extensions, wholeProject) {
  // ⚠️ 关键问题：如果 VM 中已有 targets，会发生什么？
  
  // 🔧 修复：强制清除已有 targets
  if (this.runtime.targets.length > 0 && wholeProject) {
    console.warn('⚠️ VM 中已有 targets，强制清除');
    this.runtime.targets.slice().forEach(t => {
      this.runtime.disposeTarget(t);
    });
  }
  
  // 继续安装新的 targets
  targets.forEach(target => {
    this.runtime.targets.push(target);
  });
}
```

### 防止重复加载

```javascript
// render-gui.jsx
window.scratchLoadProjectData = async (projectData) => {
  console.log('📥 开始加载项目数据');
  
  // 1. 防止 HMR 导致的重复加载
  const projectId = projectData.projectId || Date.now();
  if (window.__lastLoadedProjectId === projectId) {
    console.log('⚠️ 项目已加载，跳过（防止 HMR 重复加载）');
    return;
  }
  window.__lastLoadedProjectId = projectId;
  
  // 2. 设置加载标志（防止 onVmInit 误删）
  window.__projectLoadStarted = true;
  
  // 3. 手动强制清除 targets（防御性编程）
  if (vm && vm.runtime && vm.runtime.targets) {
    const oldTargets = vm.runtime.targets.slice();
    oldTargets.forEach(t => {
      vm.runtime.disposeTarget(t);
    });
  }
  
  // 4. 调用 VM 的 loadProject
  await vm.loadProject(projectData);
  
  console.log('✅ 项目加载完成');
};
```

### 过滤默认精灵

```javascript
// sb3.js (序列化时过滤)
const serialize = function (runtime, targetId) {
  const serializedTargets = flattenedOriginalTargets.map(t => serializeTarget(t, extensions));
  
  // 🔧 过滤掉空的默认精灵
  const filteredTargets = serializedTargets.filter(target => {
    if (target.isStage) return true;
    
    const hasBlocks = target.blocks && Object.keys(target.blocks).length > 0;
    if (hasBlocks) return true;
    
    // 过滤掉默认的 "角色1" 或 "Sprite1"（如果没有积木）
    if (target.name === '角色1' || target.name === 'Sprite1') {
      return false;
    }
    
    return true;
  });
  
  obj.targets = filteredTargets;
  return JSON.stringify(obj);
};
```

---

## 常见问题与解决方案

### 1. 登录后需要刷新才显示用户名

**原因：**
- iframe 渲染早于 API 返回
- `window.__scratchUserInfo` 初始化时序问题

**解决方案：**
1. ✅ 立即初始化 `window.__scratchUserInfo`（默认未登录）
2. ✅ iframe 延迟渲染，等待用户信息
3. ✅ API 返回后立即更新全局状态，然后通过 postMessage 通知 iframe

### 2. 重复精灵问题

**原因：**
- Webpack HMR 导致 `vm.loadProject()` 被调用两次
- `installTargets()` 未清除已有 targets

**解决方案：**
1. ✅ 添加 `window.__lastLoadedProjectId` 防止重复加载
2. ✅ `installTargets()` 中强制清除已有 targets
3. ✅ 序列化时过滤空的默认精灵

### 3. Toast 提示显示时间过长

**原因：**
- sonner 默认显示 4 秒

**解决方案：**
```typescript
toast.success('操作成功', { duration: 2000 }); // 2秒
```

### 4. 缓存导致代码不更新

**原因：**
- 浏览器缓存了 `gui.js`
- Service Worker 缓存

**解决方案：**
```bash
# 强制刷新
Ctrl + Shift + R  (Windows/Linux)
Cmd + Shift + R   (Mac)

# 清除缓存
Ctrl + Shift + Delete
```

---

## 最佳实践

### 1. 状态管理

```typescript
// ✅ 好的做法
const updateUserInfo = (userInfo) => {
  // 统一的更新入口
  window.__scratchUserInfo = userInfo;
  setUsername(userInfo.username);
  notifyIframe();
};

// ❌ 不好的做法
setUsername(data.username);  // 只更新 React state
// ... 忘记更新 window.__scratchUserInfo
```

### 2. 消息通信

```typescript
// ✅ 好的做法
iframeRef.current.contentWindow.postMessage(
  { type: 'USER_INFO_UPDATE', data: userInfo },
  'http://localhost:8601'  // 指定 targetOrigin
);

// ❌ 不好的做法
iframeRef.current.contentWindow.postMessage(
  userInfo,  // 没有 type 字段
  '*'  // 不安全的 targetOrigin
);
```

### 3. 错误处理

```javascript
// ✅ 好的做法
window.scratchLoadProjectData = async (projectData) => {
  try {
    if (!vm) throw new Error('VM 未初始化');
    if (!projectData) throw new Error('项目数据为空');
    
    await vm.loadProject(projectData);
    
    return { success: true };
  } catch (error) {
    console.error('加载失败:', error);
    return { success: false, error: error.message };
  }
};

// ❌ 不好的做法
window.scratchLoadProjectData = async (projectData) => {
  await vm.loadProject(projectData);  // 没有错误处理
};
```

### 4. 日志管理

```javascript
// ✅ 好的做法
if (process.env.NODE_ENV === 'development') {
  console.log('🔍 调试信息:', data);
}

// 生产环境使用日志库
import log from './lib/log';
log.info('用户登录:', username);

// ❌ 不好的做法
console.log(data);  // 生产环境也输出
```

---

## 参考资源

### 官方文档
- [scratch-gui GitHub](https://github.com/scratchfoundation/scratch-gui)
- [scratch-vm GitHub](https://github.com/scratchfoundation/scratch-vm)
- [scratch-editor GitHub](https://github.com/scratchfoundation/scratch-editor)

### 关键文件
- `packages/scratch-gui/src/lib/vm-listener-hoc.jsx` - 用户信息传递
- `packages/scratch-gui/src/components/menu-bar/menu-bar.jsx` - 菜单栏逻辑
- `packages/scratch-gui/src/playground/render-gui.jsx` - iframe 启动脚本
- `packages/scratch-vm/src/virtual-machine.js` - VM 核心逻辑
- `packages/scratch-vm/src/serialization/sb3.js` - 项目序列化

### 社区资源
- [Scratch Wiki](https://en.scratch-wiki.info/)
- [Scratch Forums](https://scratch.mit.edu/discuss/)

---

## 版本信息

- **文档版本**: 1.0.0
- **最后更新**: 2025-11-07
- **作者**: 柳老师 & Cursor AI
- **适用版本**: scratch-gui develop 分支

---

## 许可证

本文档基于 Scratch 官方代码分析编写，遵循 CC BY-SA 4.0 许可协议。

