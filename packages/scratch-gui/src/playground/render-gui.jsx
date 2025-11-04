import React from 'react';
import ReactDomClient from 'react-dom/client';
import {compose} from 'redux';

import AppStateHOC from '../lib/app-state-hoc.jsx';
import GUI from '../containers/gui.jsx';
import HashParserHOC from '../lib/hash-parser-hoc.jsx';
import log from '../lib/log.js';
import {PLATFORM} from '../lib/platform.js';

const onClickLogo = () => {
    window.location = 'https://scratch.mit.edu';
};

const handleTelemetryModalCancel = () => {
    log('User canceled telemetry modal');
};

const handleTelemetryModalOptIn = () => {
    log('User opted into telemetry');
};

const handleTelemetryModalOptOut = () => {
    log('User opted out of telemetry');
};

/*
 * Render the GUI playground. This is a separate function because importing anything
 * that instantiates the VM causes unsupported browsers to crash
 * {object} appTarget - the DOM element to render to
 */
export default appTarget => {
    GUI.setAppElement(appTarget);

    // note that redux's 'compose' function is just being used as a general utility to make
    // the hierarchy of HOC constructor calls clearer here; it has nothing to do with redux's
    // ability to compose reducers.
    const WrappedGui = compose(
        AppStateHOC,
        HashParserHOC
    )(GUI);

    // TODO a hack for testing the backpack, allow backpack host to be set by url param
    const backpackHostMatches = window.location.href.match(/[?&]backpack_host=([^&]*)&?/);
    const backpackHost = backpackHostMatches ? backpackHostMatches[1] : null;

    const scratchDesktopMatches = window.location.href.match(/[?&]isScratchDesktop=([^&]+)/);
    let simulateScratchDesktop;
    if (scratchDesktopMatches) {
        try {
            // parse 'true' into `true`, 'false' into `false`, etc.
            simulateScratchDesktop = JSON.parse(scratchDesktopMatches[1]);
        } catch {
            // it's not JSON so just use the string
            // note that a typo like "falsy" will be treated as true
            simulateScratchDesktop = scratchDesktopMatches[1];
        }
    }

    if (process.env.NODE_ENV === 'production' && typeof window === 'object') {
        // Warn before navigating away
        window.onbeforeunload = () => true;
    }

    const root = ReactDomClient.createRoot(appTarget);

    // 存储用户信息（由 postMessage 更新）
    window.__scratchUserInfo = {
        isLoggedIn: false,
        username: null,
        avatarUrl: null
    };

    // 定义 renderApp 函数的引用（稍后定义）
    let renderAppFunction = null;

    // 监听来自父窗口的消息
    window.addEventListener('message', (event) => {
        console.log('========================================');
        console.log('📬 iframe 收到 postMessage');
        console.log('Origin:', event.origin);
        console.log('Data:', event.data);
        console.log('Data type:', typeof event.data);
        if (event.data && typeof event.data === 'object') {
            console.log('❗ Message TYPE:', event.data.type);
        }
        console.log('========================================');
        
        // 安全检查：确保消息来自 localhost
        if (!event.origin.includes('localhost')) {
            console.warn('⚠️ 忽略非 localhost 来源的消息:', event.origin);
            return;
        }
        
        if (event.data && event.data.type === 'USER_INFO_UPDATE') {
            console.log('========================================');
            console.log('📨 iframe 收到 USER_INFO_UPDATE');
            console.log('========================================');
            console.log('收到的数据:', event.data.data);
            
            // 更新本地用户信息
            const newUserInfo = {
                isLoggedIn: event.data.data.isLoggedIn || false,
                username: event.data.data.username || null,
                avatarUrl: event.data.data.avatarUrl || null
            };
            
            console.log('旧的 window.__scratchUserInfo:', window.__scratchUserInfo);
            window.__scratchUserInfo = newUserInfo;
            console.log('新的 window.__scratchUserInfo:', window.__scratchUserInfo);
            
            // 向父窗口发送确认消息
            try {
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage({
                        type: 'USER_INFO_UPDATE_ACK',
                        data: {
                            success: true,
                            userInfo: window.__scratchUserInfo,
                            timestamp: new Date().toISOString()
                        }
                    }, '*');
                    console.log('✅ 已向父窗口发送确认消息');
                }
            } catch (e) {
                console.error('❌ 发送确认消息失败:', e);
            }
            
            // 触发重新渲染
            if (renderAppFunction) {
                console.log('🔄 开始重新渲染...');
                console.log('renderAppFunction 类型:', typeof renderAppFunction);
                
                try {
                    renderAppFunction();
                    console.log('✅ 重新渲染完成');
                } catch (e) {
                    console.error('❌ 重新渲染失败:', e);
                }
            } else {
                console.warn('⚠️ renderAppFunction 尚未初始化，无法重新渲染');
            }
            
            console.log('========================================');
        }
        
        // 处理加载项目请求
        if (event.data && event.data.type === 'LOAD_PROJECT') {
            console.log('📥 收到父窗口的加载项目请求:', event.data.data);
            
            if (window.scratchLoadProjectData) {
                window.scratchLoadProjectData(event.data.data)
                    .then(() => {
                        console.log('✅ 项目数据已加载到 Scratch 编辑器');
                        
                        // 向父窗口发送确认消息
                        if (window.parent && window.parent !== window) {
                            window.parent.postMessage({
                                type: 'LOAD_PROJECT_ACK',
                                data: {
                                    success: true,
                                    timestamp: new Date().toISOString()
                                }
                            }, '*');
                        }
                    })
                    .catch((error) => {
                        console.error('❌ 加载项目数据失败:', error);
                        
                        // 向父窗口发送失败消息
                        if (window.parent && window.parent !== window) {
                            window.parent.postMessage({
                                type: 'LOAD_PROJECT_ACK',
                                data: {
                                    success: false,
                                    error: error.message,
                                    timestamp: new Date().toISOString()
                                }
                            }, '*');
                        }
                    });
            } else {
                console.error('❌ scratchLoadProjectData 函数不存在');
            }
        }
        
        // 处理导出项目请求（用于测试）
        if (event.data && event.data.type === 'EXPORT_PROJECT_REQUEST') {
            console.log('📤 收到父窗口的导出项目请求');
            
            if (window.scratchExportProjectData) {
                const projectData = window.scratchExportProjectData();
                
                if (projectData) {
                    console.log('✅ 导出成功，准备发送响应');
                    console.log('📦 projectData 类型:', typeof projectData);
                    console.log('📦 projectData 是否为对象:', typeof projectData === 'object');
                    console.log('📦 projectData.targets 存在:', !!projectData?.targets);
                    
                    // 🔧 关键修复：确保发送的是对象而不是字符串
                    let dataToSend = projectData;
                    if (typeof projectData === 'string') {
                        console.warn('⚠️ projectData 是字符串，尝试解析...');
                        try {
                            dataToSend = JSON.parse(projectData);
                            console.log('✅ 成功解析为对象');
                        } catch (e) {
                            console.error('❌ 解析失败，发送原始字符串', e);
                        }
                    }
                    
                    console.log('📨 发送响应，data 类型:', typeof dataToSend);
                    
                    window.parent.postMessage({
                        type: 'EXPORT_PROJECT_RESPONSE',
                        data: dataToSend
                    }, '*');
                } else {
                    console.error('❌ 导出失败');
                }
            } else {
                console.error('❌ scratchExportProjectData 函数不存在');
            }
        }
        
        // 处理获取缩略图请求（现在是异步的）
        if (event.data && event.data.type === 'GET_THUMBNAIL') {
            console.log('📸 收到父窗口的获取缩略图请求');
            
            if (window.scratchGetThumbnail) {
                // scratchGetThumbnail 现在返回 Promise
                window.scratchGetThumbnail().then(thumbnail => {
                    if (thumbnail) {
                        console.log('✅ 缩略图生成成功，发送响应');
                        window.parent.postMessage({
                            type: 'THUMBNAIL_RESPONSE',
                            data: thumbnail
                        }, '*');
                    } else {
                        console.error('❌ 缩略图生成失败');
                        window.parent.postMessage({
                            type: 'THUMBNAIL_RESPONSE',
                            data: null
                        }, '*');
                    }
                }).catch(error => {
                    console.error('❌ 缩略图生成异常:', error);
                    window.parent.postMessage({
                        type: 'THUMBNAIL_RESPONSE',
                        data: null
                    }, '*');
                });
            } else {
                console.error('❌ scratchGetThumbnail 函数不存在');
                window.parent.postMessage({
                    type: 'THUMBNAIL_RESPONSE',
                    data: null
                }, '*');
            }
        }
        
        // 处理状态检查请求（用于诊断）
        if (event.data && event.data.type === 'CHECK_STATUS') {
            console.log('🔍 收到状态检查请求');
            
            window.parent.postMessage({
                type: 'STATUS_RESPONSE',
                data: {
                    vmReady: !!window.__scratchVM,
                    exportFn: typeof window.scratchExportProjectData === 'function',
                    loadFn: typeof window.scratchLoadProjectData === 'function',
                    userLoggedIn: !!(window.__scratchUserInfo && window.__scratchUserInfo.isLoggedIn)
                }
            }, '*');
        }
    });
    
    console.log('✅ postMessage 监听器已设置');
    
    // 立即通知父窗口：iframe 已准备好接收消息
    if (window.parent && window.parent !== window) {
        console.log('📨 通知父窗口：iframe 监听器已准备好');
        window.parent.postMessage({
            type: 'IFRAME_READY',
            data: {
                timestamp: new Date().toISOString()
            }
        }, '*');
        console.log('✅ IFRAME_READY 消息已发送');
    }

    // 全局变量：存储 VM 实例的引用
    window.__scratchVM = null;
    
    // 预先声明导出函数（防止竞态条件）
    window.scratchExportProjectData = () => {
        console.warn('⚠️ scratchExportProjectData 被调用，但 VM 尚未初始化');
        return null;
    };
    
    window.scratchLoadProjectData = () => {
        console.warn('⚠️ scratchLoadProjectData 被调用，但 VM 尚未初始化');
        return Promise.reject('VM not initialized');
    };

    // 从本地存储获取用户信息
    const getUserInfo = () => {
        const userInfo = window.__scratchUserInfo;
        console.log('🔍 getUserInfo() 被调用，window.__scratchUserInfo =', userInfo);
        
        // 如果用户信息存在且已登录，返回用户信息
        if (userInfo && userInfo.isLoggedIn && userInfo.username) {
            console.log('✅ 返回已登录用户信息:', {
                isLoggedIn: userInfo.isLoggedIn,
                username: userInfo.username,
                avatarUrl: userInfo.avatarUrl || null
            });
            return {
                isLoggedIn: userInfo.isLoggedIn,
                username: userInfo.username,
                avatarUrl: userInfo.avatarUrl || null
            };
        }
        
        // 否则返回未登录状态
        console.log('❌ 返回未登录状态');
        return {
            isLoggedIn: false,
            username: null,
            avatarUrl: null
        };
    };

    // 登录注册处理器
    const handleOpenRegistration = () => {
        if (window.scratchRegisterHandler) {
            window.scratchRegisterHandler();
        } else {
            window.location.href = '/register';
        }
    };

    const handleLogOut = () => {
        console.log('🚪 iframe: 用户点击退出登录');
        
        // 尝试调用父窗口的处理器
        try {
            if (window.parent && window.parent !== window && window.parent.scratchLogoutHandler) {
                console.log('✅ iframe: 调用父窗口的 scratchLogoutHandler');
                window.parent.scratchLogoutHandler();
                return;
            }
        } catch (e) {
            console.warn('⚠️ iframe: 无法访问父窗口的 scratchLogoutHandler (跨域限制):', e.message);
        }
        
        // 如果无法访问父窗口，尝试通过 postMessage 通知父窗口
        if (window.parent && window.parent !== window) {
            console.log('📨 iframe: 通过 postMessage 请求退出登录');
            window.parent.postMessage({
                type: 'SCRATCH_LOGOUT_REQUEST'
            }, '*');
        } else {
            console.error('❌ iframe: 无法退出登录');
            alert('登出功能未配置');
        }
    };

    // 自定义登录渲染（如果需要）
    const renderLogin = ({onClose}) => {
        if (window.scratchLoginHandler) {
            window.scratchLoginHandler();
            onClose();
        }
        return null;
    };

    // 渲染函数
    const renderApp = () => {
        const userInfo = getUserInfo();
        console.log('🎨 渲染 Scratch 编辑器，用户信息:', userInfo);
        console.log('📌 传递给 WrappedGui 的 username:', userInfo.username);
        console.log('📌 传递给 WrappedGui 的 isLoggedIn:', userInfo.isLoggedIn);
        
        root.render(
            // important: this is checking whether `simulateScratchDesktop` is truthy, not just defined!
            simulateScratchDesktop ?
                <WrappedGui
                    canEditTitle
                    platform={PLATFORM.DESKTOP}
                    showTelemetryModal
                    canSave={false}
                    onTelemetryModalCancel={handleTelemetryModalCancel}
                    onTelemetryModalOptIn={handleTelemetryModalOptIn}
                    onTelemetryModalOptOut={handleTelemetryModalOptOut}
                /> :
                <WrappedGui
                    canEditTitle
                    backpackVisible
                    showComingSoon
                    backpackHost={backpackHost}
                    canSave={false}
                    onClickLogo={onClickLogo}
                    
                    // 登录相关配置
                    username={userInfo.username}
                    accountMenuOptions={{
                        canHaveSession: true,
                        canRegister: true,
                        canLogin: true,
                        canLogout: userInfo.isLoggedIn,
                        // 使用 MetaSeekOJ 的真实头像
                        avatarUrl: userInfo.avatarUrl || undefined,
                        // "我的作品" 链接
                        myStuffUrl: 'http://localhost:8081/classroom/scratch/projects',
                        // 移除个人资料和账号设置
                        profileUrl: null,
                        accountSettingsUrl: null
                    }}
                    onOpenRegistration={handleOpenRegistration}
                    onLogOut={handleLogOut}
                    renderLogin={renderLogin}
                    
                    // VM 实例回调（用于导出项目数据）
                    onVmInit={(vm) => {
                        console.log('========================================');
                        console.log('🎉 onVmInit 回调被触发！');
                        console.log('========================================');
                        console.log('✅ VM 实例已初始化');
                        console.log('🔍 VM 类型:', typeof vm);
                        console.log('🔍 VM.toJSON 存在:', typeof vm.toJSON === 'function');
                        console.log('🔍 window.parent 存在:', window.parent && window.parent !== window);
                        
                        window.__scratchVM = vm;
                        
                        // 导出项目数据的全局函数（iframe 内部）
                        window.scratchExportProjectData = () => {
                            if (vm) {
                                console.log('=' .repeat(60));
                                console.log('📤 开始导出项目数据');
                                console.log('=' .repeat(60));
                                
                                // 导出前先检查 VM 状态
                                console.log('📊 导出前 VM 状态:');
                                if (vm.runtime && vm.runtime.targets) {
                                    const totalBlocks = vm.runtime.targets.reduce((sum, target) => 
                                        sum + Object.keys(target.blocks._blocks || {}).length, 0);
                                    console.log('   - VM 中积木数量:', totalBlocks);
                                    console.log('   - targets 数量:', vm.runtime.targets.length);
                                    
                                    if (totalBlocks === 0) {
                                        console.warn('⚠️ 警告：VM 中没有积木！可能未加载项目或项目为空');
                                    }
                                }
                                
                                const data = vm.toJSON();
                                console.log('✅ vm.toJSON() 执行完成');
                                console.log('📦 导出数据大小:', JSON.stringify(data).length, '字节');
                                
                                if (data && data.targets) {
                                    const exportedBlocks = data.targets.reduce((sum, target) => 
                                        sum + Object.keys(target.blocks || {}).length, 0);
                                    console.log('📊 导出数据中积木数量:', exportedBlocks);
                                    
                                    if (exportedBlocks === 0) {
                                        console.error('❌ 严重错误：导出的数据中没有积木！');
                                    }
                                }
                                
                                console.log('=' .repeat(60));
                                return data;
                            }
                            console.warn('⚠️ VM 实例不可用');
                            return null;
                        };
                        
                        // 加载项目数据的全局函数（iframe 内部）
                        window.scratchLoadProjectData = (projectData) => {
                            if (vm) {
                                console.log('=' .repeat(60));
                                console.log('📥 开始加载项目数据到 VM');
                                console.log('=' .repeat(60));
                                console.log('📦 projectData 类型:', typeof projectData);
                                console.log('📦 projectData keys:', projectData ? Object.keys(projectData) : 'null');
                                
                                if (projectData && projectData.targets) {
                                    console.log('📊 targets 数量:', projectData.targets.length);
                                    const totalBlocks = projectData.targets.reduce((sum, target) => 
                                        sum + Object.keys(target.blocks || {}).length, 0);
                                    console.log('📊 总积木数量:', totalBlocks);
                                } else {
                                    console.warn('⚠️ projectData 没有 targets！');
                                }
                                
                                // 加载前先检查当前 VM 状态
                                console.log('📊 加载前 VM 状态:');
                                if (vm.runtime && vm.runtime.targets) {
                                    const beforeBlocks = vm.runtime.targets.reduce((sum, target) => 
                                        sum + Object.keys(target.blocks._blocks || {}).length, 0);
                                    console.log('   - 当前积木数量:', beforeBlocks);
                                }
                                
                                return vm.loadProject(projectData).then(() => {
                                    console.log('✅ vm.loadProject 执行完成');
                                    
                                    // 加载后检查 VM 状态
                                    console.log('📊 加载后 VM 状态:');
                                    if (vm.runtime && vm.runtime.targets) {
                                        const afterBlocks = vm.runtime.targets.reduce((sum, target) => 
                                            sum + Object.keys(target.blocks._blocks || {}).length, 0);
                                        console.log('   - 当前积木数量:', afterBlocks);
                                        
                                        if (afterBlocks === 0) {
                                            console.error('❌ 严重错误：加载后 VM 中的积木数量为 0！');
                                        } else {
                                            console.log('✅ 项目加载成功，VM 中有积木');
                                        }
                                    }
                                    console.log('=' .repeat(60));
                                });
                            }
                            console.warn('⚠️ VM 实例不可用');
                            return Promise.reject('VM not available');
                        };
                        
                        // 获取舞台截图的全局函数（iframe 内部）
                        // 使用 requestSnapshot 获取真实大小的截图，而不是 extractDataURI
                        window.scratchGetThumbnail = () => {
                            return new Promise((resolve) => {
                                if (vm && vm.runtime && vm.runtime.renderer) {
                                    console.log('📸 生成舞台截图（使用 requestSnapshot）...');
                                    try {
                                        // 设置透明预览模式
                                        vm.postIOData('video', {forceTransparentPreview: true});
                                        
                                        // 请求截图
                                        vm.renderer.requestSnapshot(dataURI => {
                                            // 恢复正常模式
                                            vm.postIOData('video', {forceTransparentPreview: false});
                                            
                                            if (dataURI && dataURI.length > 100) {
                                                console.log('✅ 截图生成成功，大小:', dataURI.length, '字节');
                                                resolve(dataURI);
                                            } else {
                                                console.warn('⚠️ 截图太小或为空');
                                                resolve(null);
                                            }
                                        });
                                        
                                        // 触发绘制
                                        vm.renderer.draw();
                                    } catch (error) {
                                        console.error('❌ 截图生成失败:', error);
                                        resolve(null);
                                    }
                                } else {
                                    console.warn('⚠️ VM 或 Renderer 不可用');
                                    resolve(null);
                                }
                            });
                        };
                        
                        console.log('✅ 导出/加载函数已设置');
                        console.log('🔍 scratchExportProjectData 类型:', typeof window.scratchExportProjectData);
                        console.log('🔍 scratchLoadProjectData 类型:', typeof window.scratchLoadProjectData);
                        
                        // 向父窗口通知 VM 已初始化
                        const notifyParent = () => {
                            try {
                                console.log('📨 准备通知父窗口 VM 已初始化...');
                                
                                if (window.parent && window.parent !== window) {
                                    const message = {
                                        type: 'SCRATCH_VM_READY',
                                        data: {
                                            timestamp: new Date().toISOString()
                                        }
                                    };
                                    
                                    console.log('📨 发送消息:', message);
                                    window.parent.postMessage(message, '*');
                                    console.log('✅ 消息已发送到父窗口');
                                } else {
                                    console.log('⚠️ 没有父窗口（独立运行）');
                                }
                            } catch (e) {
                                console.error('❌ 发送消息失败:', e);
                            }
                        };
                        
                        // 立即通知
                        notifyParent();
                        
                        // 延迟 500ms 再通知一次（确保父窗口监听器已设置）
                        setTimeout(() => {
                            console.log('🔁 延迟 500ms 再次通知父窗口...');
                            notifyParent();
                        }, 500);
                        
                        console.log('========================================');
                    }}
                />
        );
    };

    // 保存 renderApp 函数的引用（供 postMessage 回调使用）
    renderAppFunction = renderApp;
    
    // 初始渲染
    renderApp();

    // 监听用户信息变化（每秒检查一次）
    setInterval(() => {
        const currentUserInfo = getUserInfo();
        
        // 初始化 lastUserInfo
        if (!window.__lastUserInfo) {
            window.__lastUserInfo = {
                isLoggedIn: false,
                username: null
            };
        }
        
        // 只有当用户信息真正变化时才重新渲染
        const userInfoChanged = 
            currentUserInfo.isLoggedIn !== window.__lastUserInfo.isLoggedIn ||
            currentUserInfo.username !== window.__lastUserInfo.username;
        
        if (userInfoChanged) {
            console.log('🔄 检测到用户信息变化，重新渲染');
            console.log('   之前:', window.__lastUserInfo);
            console.log('   现在:', currentUserInfo);
            
            window.__lastUserInfo = {
                isLoggedIn: currentUserInfo.isLoggedIn,
                username: currentUserInfo.username
            };
            
            renderApp();
        }
    }, 1000);
};
