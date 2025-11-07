# Scratch 用户认证架构对比

> 对比官方实现和当前 iframe 方案，分析登录状态同步问题的根本原因

## 📊 架构对比表

| 层级 | 官方 (scratch-www) | 当前 (MetaSeekOJ) | 问题 |
|------|-------------------|------------------|------|
| **状态管理** | Redux store (session reducer) | React state + window global | ⚠️ 双重状态 |
| **数据流** | Redux → props → VM | API → state → global → postMessage → props → VM | ⚠️ 路径过长 |
| **更新机制** | React 自动 | 手动同步 | ⚠️ 时序问题 |
| **初始化** | SSR 或同步 | 异步 API | ⚠️ 竞态条件 |

---

## 官方实现详解

### 1. scratch-www 的 session 管理

```javascript
// scratch-www/src/redux/session.js
const initialState = {
  session: {
    user: null,  // 登录后为 {username, id, thumbnailUrl, ...}
    permissions: {
      admin: false,
      educator: false,
      student: false
    }
  },
  status: {
    FETCHED: false
  }
};

// 获取 session 的 action
export const refreshSession = () => dispatch => {
  dispatch({type: 'SET_SESSION_STATUS', status: 'FETCHING'});
  
  return fetch('/session/', {credentials: 'include'})
    .then(response => response.json())
    .then(body => {
      if (body.user) {
        dispatch({
          type: 'SET_SESSION',
          session: body
        });
      } else {
        dispatch({type: 'SET_SESSION_STATUS', status: 'NOT_LOGGED_IN'});
      }
    });
};
```

### 2. 应用启动时的 session 加载

```jsx
// scratch-www/src/main.jsx
import {refreshSession} from './redux/session';

// App 启动时立即加载 session
store.dispatch(refreshSession()).then(() => {
  // session 加载完成后再渲染 GUI
  ReactDOM.render(
    <Provider store={store}>
      <GUI />
    </Provider>,
    document.getElementById('app')
  );
});
```

**关键点：**
- ✅ session 在渲染前就已经准备好
- ✅ 不存在 "等待用户信息" 的问题
- ✅ GUI 渲染时 `username` prop 已经是最新值

### 3. GUI 接收 props

```jsx
// scratch-gui/src/containers/gui.jsx
import {connect} from 'react-redux';

const mapStateToProps = (state, ownProps) => ({
  username: ownProps.username ?? (
    state.session?.session?.user?.username || ''
  )
});

export default connect(mapStateToProps)(GUI);
```

**两种使用方式：**

**方式A: 通过 ownProps 传入（独立集成）**
```jsx
<GUI username="柳老师" />
```

**方式B: 从 Redux state 读取（scratch-www 环境）**
```jsx
<Provider store={store}>
  <GUI />  {/* 自动从 store.session 读取 */}
</Provider>
```

### 4. vm-listener-hoc 自动同步

```javascript
// scratch-gui/src/lib/vm-listener-hoc.jsx
class VMListener extends React.Component {
  componentDidMount() {
    // 组件挂载时，立即同步 username 到 VM
    this.props.vm.postIOData('userData', {
      username: this.props.username
    });
  }
  
  componentDidUpdate(prevProps) {
    // username 变化时，自动同步到 VM
    if (prevProps.username !== this.props.username) {
      this.props.vm.postIOData('userData', {
        username: this.props.username
      });
    }
  }
}
```

**关键点：**
- ✅ React 生命周期自动处理
- ✅ 无需手动调用同步函数
- ✅ props 变化自动触发更新

---

## 当前实现分析

### 1. 数据流路径

```
┌─────────────────────────────────────────────────────────────┐
│ 步骤1: Editor.tsx 挂载                                       │
│   useEffect(() => { checkLoginStatus(); }, [])              │
└───────────────────────────┬─────────────────────────────────┘
                            │ (异步)
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 步骤2: API 调用（需要等待）                                  │
│   fetch('/api/profile/')                                     │
└───────────────────────────┬─────────────────────────────────┘
                            │ (100-500ms 延迟)
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 步骤3: 更新状态（多处）                                      │
│   window.__scratchUserInfo = {...}                           │
│   setUsername(...)                                           │
│   setAvatarUrl(...)                                          │
│   setIsLoggedIn(...)                                         │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 步骤4: 发送 postMessage（如果 iframe 已加载）                │
│   if (iframeLoaded) { sendUserInfo(); }                      │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ iframe: 接收消息并重新渲染                                   │
│   window.addEventListener('message', ...)                    │
│   renderApp();                                               │
└─────────────────────────────────────────────────────────────┘
```

### 2. 时序问题

#### 场景A: 刷新页面

```
时间轴:
  0ms   ├─ Editor.tsx 挂载
        │  - window.__scratchUserInfo = {isLoggedIn: false} (默认)
        │  - 开始 API 调用
        │
 50ms   ├─ iframe 加载完成
        │  - 开始检查 window.__scratchUserInfo
        │  - 发现 isLoggedIn = false
        │  - 渲染为未登录状态
        │
100ms   ├─ iframe 等待超时，开始渲染
        │  - 使用默认值渲染（未登录）
        │
200ms   ├─ API 返回
        │  - 更新 window.__scratchUserInfo = {isLoggedIn: true, ...}
        │  - 更新 React state
        │  - 发送 postMessage
        │
250ms   ├─ iframe 收到消息
        │  - 重新渲染（登录状态）✅
        │  - 问题：已经渲染过一次了
```

**问题：**
- ⚠️ iframe 渲染了两次（先未登录，后登录）
- ⚠️ 如果 API 太慢（>500ms），iframe 会用默认值渲染
- ⚠️ postMessage 可能丢失（如果 iframe 还没有设置监听器）

#### 场景B: 登录后

```
时间轴:
  0ms   ├─ 用户点击登录
        │  - 弹出登录窗口
        │
1000ms  ├─ 登录成功
        │  - 关闭登录窗口
        │  - 调用 refreshUserInfo()
        │
1100ms  ├─ API 调用
        │  - 更新 window.__scratchUserInfo
        │  - 更新 React state
        │  - 发送 postMessage ✅
        │
1150ms  ├─ iframe 收到消息
        │  - 重新渲染（显示用户名）✅
```

**问题：**
- ✅ 这个场景正常工作
- ✅ 因为 iframe 已经加载完成并设置了监听器

### 3. 双重状态问题

```typescript
// Editor.tsx
const [username, setUsername] = useState('');           // React state (UI 显示)
(window as any).__scratchUserInfo = {...};              // 全局状态 (通信)

// 问题：需要手动保持同步
const updateUserInfo = (data) => {
  // 1. 更新全局状态
  window.__scratchUserInfo = {...};
  
  // 2. 更新 React state
  setUsername(data.username);
  
  // 3. 通知 iframe
  sendUserInfo();
  
  // ⚠️ 如果忘记任何一步，就会不同步
};
```

---

## 根本问题分析

### 问题1: iframe 渲染时机不可控

**原因：**
- iframe 的 `onload` 事件触发时，父窗口的 API 可能还没返回
- iframe 内的 `render-gui.jsx` 立即执行，需要用户信息

**官方如何避免：**
- scratch-www 在渲染前就加载好 session（SSR 或同步加载）
- GUI 渲染时 props 已经是正确值

**当前方案的妥协：**
- iframe 延迟渲染（等待 500ms）
- 通过 postMessage 触发重新渲染

### 问题2: React state 和全局状态不同步

**原因：**
- React state 更新是异步的
- `sendUserInfo()` 依赖 React state
- 但 iframe 读取的是 `window.__scratchUserInfo`

**示例：**

```typescript
// ❌ 错误的实现
const sendUserInfo = () => {
  iframeRef.current.contentWindow.postMessage({
    type: 'USER_INFO_UPDATE',
    data: {
      isLoggedIn,      // React state，可能是旧值
      username,        // React state，可能是旧值
      avatarUrl        // React state，可能是旧值
    }
  }, 'http://localhost:8601');
};

setUsername('新用户名');
sendUserInfo();  // ⚠️ 这里发送的还是旧的 username
```

**当前的修复：**

```typescript
// ✅ 修复：直接读取全局状态
const sendUserInfo = useCallback(() => {
  const latestUserInfo = window.__scratchUserInfo || {...};
  
  iframeRef.current.contentWindow.postMessage({
    type: 'USER_INFO_UPDATE',
    data: latestUserInfo  // 始终是最新值
  }, 'http://localhost:8601');
}, []);  // 不依赖任何 state
```

### 问题3: 初始化竞态条件

**三个并发过程：**

```
过程A: Editor.tsx 初始化
  ├─ useEffect(() => { checkLoginStatus(); }, [])
  └─ (异步)

过程B: iframe 加载
  ├─ <iframe onLoad={...} />
  └─ (可能比 API 快)

过程C: render-gui.jsx 初始化
  ├─ 检查 window.__scratchUserInfo
  └─ (可能在 API 返回前执行)
```

**可能的时序：**

| 时序 | 结果 |
|------|------|
| C → A | ❌ iframe 用默认值渲染，后续收到 postMessage 更新 |
| A → C | ✅ iframe 渲染时已有正确值 |
| C ∥ A | ⚠️ 看谁先完成 |

---

## 解决方案对比

### 方案1: 官方推荐（npm 包集成）

```tsx
import GUI from 'scratch-gui';
import {Provider} from 'react-redux';
import {configureStore} from '@reduxjs/toolkit';
import sessionReducer from './reducers/session';

const store = configureStore({
  reducer: {
    session: sessionReducer,
    // ... 其他 reducers
  }
});

// 启动时加载 session
store.dispatch(refreshSession()).then(() => {
  ReactDOM.render(
    <Provider store={store}>
      <GUI />
    </Provider>,
    document.getElementById('root')
  );
});
```

**优点：**
- ✅ 完全符合官方设计
- ✅ 无时序问题
- ✅ React 自动处理更新

**缺点：**
- ❌ 需要重新构建架构
- ❌ 打包体积增加
- ❌ 迁移成本高

**迁移难度：⭐⭐⭐⭐**

### 方案2: 当前方案优化（保持 iframe）

#### 2A: 预加载用户信息

```typescript
// Editor.tsx
const [isInitialized, setIsInitialized] = useState(false);

useEffect(() => {
  // 1. 先加载用户信息
  checkLoginStatus().then(() => {
    // 2. 用户信息加载完成后，再设置 initialized
    setIsInitialized(true);
  });
}, []);

return (
  <div>
    {/* 3. 用户信息准备好后才渲染 iframe */}
    {isInitialized && (
      <iframe
        src="http://localhost:8601"
        onLoad={handleIframeLoad}
      />
    )}
  </div>
);
```

**优点：**
- ✅ iframe 渲染时用户信息已准备好
- ✅ 无需延迟渲染
- ✅ 无需 postMessage 更新

**缺点：**
- ⚠️ iframe 加载延迟（增加 100-500ms）
- ⚠️ 白屏时间增加

**迁移难度：⭐**

#### 2B: 使用 iframe 的 URL 参数传递用户信息

```typescript
// Editor.tsx
const [iframeUrl, setIframeUrl] = useState('');

useEffect(() => {
  checkLoginStatus().then(() => {
    const userInfo = window.__scratchUserInfo;
    const params = new URLSearchParams({
      username: userInfo.username || '',
      avatarUrl: userInfo.avatarUrl || '',
      isLoggedIn: userInfo.isLoggedIn.toString()
    });
    setIframeUrl(`http://localhost:8601?${params}`);
  });
}, []);

return (
  <iframe src={iframeUrl} />
);
```

```javascript
// render-gui.jsx
const params = new URLSearchParams(window.location.search);
const username = params.get('username');
const avatarUrl = params.get('avatarUrl');
const isLoggedIn = params.get('isLoggedIn') === 'true';

renderApp({username, avatarUrl, isLoggedIn});
```

**优点：**
- ✅ 简单直接
- ✅ 无时序问题
- ✅ 无需 postMessage

**缺点：**
- ❌ URL 可见（安全问题）
- ❌ 更新用户信息需要重新加载 iframe

**迁移难度：⭐⭐**

#### 2C: 使用 SharedWorker 或 BroadcastChannel

```javascript
// Editor.tsx
const channel = new BroadcastChannel('scratch-user-info');

useEffect(() => {
  checkLoginStatus().then(() => {
    channel.postMessage({
      type: 'USER_INFO',
      data: window.__scratchUserInfo
    });
  });
}, []);

// render-gui.jsx
const channel = new BroadcastChannel('scratch-user-info');

channel.addEventListener('message', (event) => {
  if (event.data.type === 'USER_INFO') {
    const userInfo = event.data.data;
    renderApp(userInfo);
  }
});

// 启动时请求用户信息
channel.postMessage({type: 'REQUEST_USER_INFO'});
```

**优点：**
- ✅ 更可靠的跨窗口通信
- ✅ 支持多个 iframe 实例
- ✅ 自动重连

**缺点：**
- ⚠️ 浏览器兼容性（IE 不支持）
- ⚠️ 增加复杂度

**迁移难度：⭐⭐⭐**

### 方案3: 混合方案

保持 iframe，但优化通信：

```typescript
// 1. 使用 React Context 管理用户状态
const UserContext = createContext();

function Editor() {
  const [userInfo, setUserInfo] = useState(null);
  const [userInfoReady, setUserInfoReady] = useState(false);
  
  useEffect(() => {
    checkLoginStatus().then(info => {
      setUserInfo(info);
      setUserInfoReady(true);
      window.__scratchUserInfo = info;
    });
  }, []);
  
  return (
    <UserContext.Provider value={userInfo}>
      {userInfoReady && (
        <iframe
          src="http://localhost:8601"
          // ... props
        />
      )}
    </UserContext.Provider>
  );
}

// 2. iframe 启动时只渲染一次，使用 URL 参数
// 3. 后续更新通过 postMessage
```

**优点：**
- ✅ 结合多种方案优点
- ✅ 初始渲染无问题
- ✅ 动态更新也支持

**缺点：**
- ⚠️ 复杂度较高

**迁移难度：⭐⭐**

---

## 推荐方案

### 短期（1-2天）：方案 2A - 预加载用户信息

**实施步骤：**

1. 添加 `isInitialized` 状态
2. 只在用户信息准备好后渲染 iframe
3. 移除 iframe 的延迟渲染逻辑
4. 保留 postMessage 用于动态更新（登录/登出）

**代码修改：**

```typescript
// Editor.tsx
const [isInitialized, setIsInitialized] = useState(false);

useEffect(() => {
  const init = async () => {
    window.__scratchUserInfo = { isLoggedIn: false, username: null, avatarUrl: null };
    await checkLoginStatus();
    setIsInitialized(true);
  };
  init();
}, []);

return (
  <div style={{width: '100%', height: '100vh'}}>
    {!isInitialized && <div>加载中...</div>}
    {isInitialized && (
      <iframe
        ref={iframeRef}
        src={SCRATCH_EDITOR_BASE_URL}
        // ...
      />
    )}
  </div>
);
```

```javascript
// render-gui.jsx
// 移除延迟渲染逻辑
const isInIframe = window.parent && window.parent !== window;

if (isInIframe) {
  // 简化：只等待 window.__scratchUserInfo 存在
  const waitForUserInfo = () => {
    if (window.__scratchUserInfo) {
      renderApp();
    } else {
      setTimeout(waitForUserInfo, 50);
    }
  };
  setTimeout(waitForUserInfo, 0);
} else {
  renderApp();
}
```

### 中期（1-2周）：方案 2B - URL 参数 + postMessage

**适用场景：**
- 初始渲染使用 URL 参数（避免时序问题）
- 动态更新使用 postMessage（登录/登出）

### 长期（1-2月）：方案 1 - npm 包集成

**适用场景：**
- 项目成熟后考虑重构
- 完全采用官方架构
- 获得类型安全和更好的开发体验

---

## 总结

| 方面 | 官方实现 | 当前实现 | 推荐优化 |
|------|---------|---------|---------|
| **状态管理** | Redux (单一来源) | React state + global (双重) | Context + global |
| **初始化** | 同步/SSR | 异步 API | 预加载 |
| **更新机制** | React 自动 | 手动 postMessage | 保持 postMessage |
| **时序保证** | ✅ 可控 | ⚠️ 不可控 | 延迟 iframe 渲染 |
| **复杂度** | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |

**核心建议：**

1. ✅ **短期**：实施方案 2A（预加载），解决刷新后需要二次刷新的问题
2. ✅ **保持**：postMessage 机制用于动态更新（已经工作良好）
3. ✅ **简化**：移除复杂的延迟渲染和重试逻辑
4. 🔄 **长期**：考虑迁移到 npm 包集成（如果项目持续发展）

**关键原则：**
- 让 iframe 渲染时，用户信息已经准备好
- 避免 "先渲染默认值，再更新" 的模式
- 保持状态的单一来源

