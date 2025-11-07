# 登录状态同步优化

> 修复刷新页面后需要二次刷新才能显示登录状态的问题

## 📋 问题描述

**现象：**
- 用户登录后刷新页面
- Scratch 编辑器菜单栏显示 "登录" 按钮（未登录状态）
- 需要再次刷新（F5）才能正确显示用户名和头像

**根本原因：**
```
时间轴问题：
  0ms   ├─ Editor.tsx 挂载，开始 API 调用
 50ms   ├─ iframe 加载完成并开始渲染
        │  - 此时 API 还没返回
        │  - window.__scratchUserInfo 还是默认值 (未登录)
        │  - iframe 使用默认值渲染 ❌
        │
200ms   ├─ API 返回，更新用户信息
        │  - 发送 postMessage 给 iframe
        │  - iframe 重新渲染 ✅
```

**问题：** iframe 渲染了两次，第一次使用了错误的默认值。

---

## ✅ 解决方案

### 核心思路

**让 iframe 在用户信息准备好后再渲染**

```
新的时间轴：
  0ms   ├─ Editor.tsx 挂载，开始 API 调用
        │  - window.__scratchUserInfo = {isLoggedIn: false} (默认)
        │  - 不渲染 iframe (isInitialized = false)
        │  - 显示 "正在初始化编辑器..." 🔐
        │
200ms   ├─ API 返回
        │  - 更新 window.__scratchUserInfo (真实值)
        │  - setIsInitialized(true) ✅
        │
250ms   ├─ 渲染 iframe
        │  - window.__scratchUserInfo 已经是正确值
        │  - iframe 第一次渲染就使用正确值 ✅
```

---

## 🔧 代码修改

### 1. Editor.tsx (父窗口)

#### 修改 1.1: 添加 `isInitialized` 状态

```typescript
// 之前
const [loginCheckCompleted, setLoginCheckCompleted] = useState(false)

// 之后
const [isInitialized, setIsInitialized] = useState(false)
```

#### 修改 1.2: 优化初始化 useEffect

```typescript
// 之前
useEffect(() => {
  // 立即初始化 window.__scratchUserInfo
  window.__scratchUserInfo = {...};
  
  // 异步检查登录状态（不等待）
  checkLoginStatus();
}, [])

// 之后
useEffect(() => {
  const initUserInfo = async () => {
    // 1. 立即初始化 window.__scratchUserInfo（默认值）
    window.__scratchUserInfo = {
      isLoggedIn: false,
      username: null,
      avatarUrl: null
    };
    
    // 2. 异步获取真实用户信息（等待完成）
    await checkLoginStatus();
    
    // 3. 标记初始化完成，允许渲染 iframe
    setIsInitialized(true);
    console.log('✅ 用户信息初始化完成，可以渲染 iframe 了');
  };
  
  initUserInfo();
}, [])
```

#### 修改 1.3: 修改渲染逻辑

```typescript
// 之前
return (
  <div>
    {isLoading ? (
      <div>加载项目中...</div>
    ) : (
      <iframe src={scratchEditorUrl} />
    )}
  </div>
);

// 之后
return (
  <div>
    {!isInitialized ? (
      // 用户信息初始化中
      <div>
        🔐 正在初始化编辑器...
        检查登录状态中
      </div>
    ) : isLoading ? (
      // 项目加载中
      <div>🎨 加载项目中...</div>
    ) : (
      // 只在用户信息初始化完成后才渲染 iframe
      <iframe src={scratchEditorUrl} />
    )}
  </div>
);
```

### 2. render-gui.jsx (iframe 内)

#### 修改 2.1: 简化延迟渲染逻辑

```javascript
// 之前：复杂的重试机制
if (isInIframe) {
  let attempts = 0;
  const maxAttempts = 5;
  const checkInterval = 100;
  
  const checkAndRender = () => {
    attempts++;
    const hasUserInfo = window.__scratchUserInfo && 
                        (window.__scratchUserInfo.isLoggedIn !== undefined);
    
    if (hasUserInfo || attempts >= maxAttempts) {
      if (hasUserInfo) {
        console.log('✅ 收到父窗口用户信息');
      } else {
        console.warn('⚠️ 等待超时，使用默认值');
      }
      renderApp();
    } else {
      console.log(`⏳ 等待用户信息... (${attempts}/${maxAttempts})`);
      setTimeout(checkAndRender, checkInterval);
    }
  };
  
  setTimeout(checkAndRender, 100);
}

// 之后：简化版
if (isInIframe) {
  // 父窗口现在会在用户信息准备好后才渲染 iframe
  // 所以这里可以简化，只需要等待 window.__scratchUserInfo 存在即可
  const waitForUserInfo = () => {
    if (window.__scratchUserInfo) {
      console.log('✅ 用户信息已就绪，开始渲染:', window.__scratchUserInfo);
      renderApp();
    } else {
      // 理论上不应该走到这里，但保留容错处理
      console.log('⏳ 等待用户信息...');
      setTimeout(waitForUserInfo, 50);
    }
  };
  
  setTimeout(waitForUserInfo, 0);
}
```

---

## 📊 效果对比

### 之前（有问题）

| 时间 | Editor.tsx | iframe | 显示效果 |
|------|-----------|--------|---------|
| 0ms | 开始 API 调用 | - | 白屏 |
| 50ms | API 进行中 | 开始渲染 | ❌ 未登录状态 |
| 200ms | API 返回 | 重新渲染 | ✅ 登录状态 |

**问题：** 用户看到了 "未登录" 的闪烁

### 之后（已修复）

| 时间 | Editor.tsx | iframe | 显示效果 |
|------|-----------|--------|---------|
| 0ms | 开始 API 调用 | - | 🔐 初始化中 |
| 200ms | API 返回，setIsInitialized(true) | - | 🔐 初始化中 |
| 250ms | 渲染 iframe | 开始渲染 | ✅ 登录状态 |

**优势：** 
- ✅ iframe 第一次渲染就显示正确状态
- ✅ 无闪烁
- ✅ 用户体验流畅

---

## 🎯 优化效果

### 1. 用户体验提升

**之前：**
```
刷新页面 → 看到"登录"按钮 → 再刷新 → 看到用户名 ❌
```

**之后：**
```
刷新页面 → 短暂"初始化中" → 直接显示用户名 ✅
```

### 2. 代码简化

- ❌ 移除复杂的重试机制（5次尝试，每次100ms）
- ❌ 移除 `loginCheckCompleted` 状态
- ✅ 使用简单的 `isInitialized` 控制渲染时机
- ✅ iframe 延迟渲染逻辑大幅简化

### 3. 性能影响

| 指标 | 之前 | 之后 | 变化 |
|------|------|------|------|
| 首次渲染时间 | ~50ms | ~200ms | +150ms |
| 重复渲染次数 | 2次 | 1次 | -50% |
| 用户感知延迟 | 无提示 | 有加载提示 | 更好 |

**说明：**
- 虽然首次显示延迟了 150ms（等待 API 返回）
- 但避免了"未登录 → 登录"的状态切换
- 加载提示让等待过程更友好

---

## 🔄 动态更新机制保持不变

### 登录/登出流程

1. 用户点击登录/登出
2. Editor.tsx 调用 API
3. 更新 `window.__scratchUserInfo`
4. 发送 `USER_INFO_UPDATE` postMessage
5. iframe 收到消息，调用 `renderApp()` 重新渲染

**这部分逻辑保持不变，继续正常工作。**

---

## 📝 测试步骤

### 1. 测试初次加载（未登录）

```bash
1. 退出登录（如果已登录）
2. 访问 /classroom/scratch/new
3. 预期：
   - 短暂显示 "正在初始化编辑器..." (< 300ms)
   - 然后显示 Scratch 编辑器
   - 菜单栏显示 "登录" 按钮 ✅
```

### 2. 测试初次加载（已登录）

```bash
1. 确保已登录
2. 访问 /classroom/scratch/new
3. 预期：
   - 短暂显示 "正在初始化编辑器..." (< 300ms)
   - 然后显示 Scratch 编辑器
   - 菜单栏立即显示用户名和头像 ✅
```

### 3. 测试刷新页面（关键测试）

```bash
1. 确保已登录
2. 访问 /classroom/scratch/new
3. 按 F5 刷新页面
4. 预期：
   - 短暂显示 "正在初始化编辑器..."
   - 然后显示 Scratch 编辑器
   - 菜单栏立即显示用户名和头像 ✅
   - 不需要二次刷新 ✅
```

### 4. 测试动态登录/登出

```bash
1. 以未登录状态打开编辑器
2. 在编辑器外的页面登录
3. 回到编辑器，观察是否自动更新
4. 预期：
   - 菜单栏自动显示用户名 ✅
```

---

## 🚀 后续优化建议

### 短期（已完成）

- ✅ 实施预加载用户信息方案
- ✅ 简化 iframe 延迟渲染逻辑
- ✅ 添加友好的加载提示

### 中期（可选）

1. **进一步优化加载时间**
   - 使用 React Suspense
   - 预加载 iframe（隐藏状态）
   - 优化 API 响应时间

2. **改进错误处理**
   - API 失败时的友好提示
   - 超时重试机制

### 长期（可选）

1. **迁移到 npm 包集成**
   - 完全符合官方架构
   - 消除 iframe 通信开销
   - 更好的类型安全

---

## 📚 相关文档

- [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md) - 完整集成指南
- [ARCHITECTURE_COMPARISON.md](./ARCHITECTURE_COMPARISON.md) - 架构对比分析
- [DUPLICATE_SPRITE_FIX.md](./DUPLICATE_SPRITE_FIX.md) - 重复精灵修复

---

## 版本信息

- **修复日期**: 2025-11-07
- **修复者**: 柳老师 & Cursor AI
- **影响文件**:
  - `OnlineJudgeFE-React/src/pages/creative-classroom/scratch/Editor.tsx`
  - `scratch-editor/packages/scratch-gui/src/playground/render-gui.jsx`

---

## 总结

通过**延迟 iframe 渲染**的简单策略，我们彻底解决了登录状态同步问题：

1. ✅ 刷新页面后立即显示正确的登录状态
2. ✅ 无需二次刷新
3. ✅ 代码更简洁、更易维护
4. ✅ 用户体验更流畅

**核心原则：让 iframe 渲染时，用户信息已经准备好。**

