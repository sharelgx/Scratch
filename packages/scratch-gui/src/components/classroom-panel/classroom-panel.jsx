import classNames from 'classnames';
import PropTypes from 'prop-types';
import React, {useEffect, useMemo, useState} from 'react';
import Draggable from 'react-draggable';

import cardStyles from '../cards/card.css';
import shrinkIcon from '../cards/icon--shrink.svg';
import expandIcon from '../cards/icon--expand.svg';
import closeIcon from '../cards/icon--close.svg';
import rightArrow from '../cards/icon--next.svg';
import leftArrow from '../cards/icon--prev.svg';

import classroomBridge from '../../lib/classroom-bridge';
import styles from './classroom-panel.css';

const CARD_HORIZONTAL_DRAG_OFFSET = 400;
const MENU_BAR_HEIGHT = 48;
const WIDE_CARD_WIDTH = 500;
const BOTTOM_MARGIN = 60;

const formatDueTime = dueTime => {
    if (!dueTime) return null;
    try {
        const date = new Date(dueTime);
        if (Number.isNaN(date.getTime())) return null;
        return `${date.getMonth() + 1}月${date.getDate()}日 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('[ClassroomPanel] 无法格式化截止时间', error);
        return null;
    }
};

const getStepMedia = step => {
    if (!step || !Array.isArray(step.media)) return null;
    
    // 辅助函数：判断是否是图片 URL
    const isImageUrl = (urlStr) => {
        if (!urlStr || typeof urlStr !== 'string') return false;
        const url = urlStr.toLowerCase();
        return (
            url.startsWith('data:image') ||
            url.endsWith('.png') ||
            url.endsWith('.jpg') ||
            url.endsWith('.jpeg') ||
            url.endsWith('.gif') ||
            url.endsWith('.webp') ||
            url.endsWith('.svg') ||
            url.endsWith('.bmp') ||
            url.includes('image/')
        );
    };
    
    // 查找图片媒体项
    const imageMedia = step.media.find(item => {
        if (!item) return false;
        
        // 如果是字符串，直接检查 URL
        if (typeof item === 'string') {
            return isImageUrl(item);
        }
        
        // 如果是字典
        if (typeof item === 'object') {
            // 优先检查 type 或 mime 字段
            if (item.type === 'image' || item.mime?.includes?.('image')) {
                return true;
            }
            
            // 如果没有 type 字段，通过 URL 判断
            const url = item.url || item.src || '';
            return isImageUrl(url);
        }
        
        return false;
    });
    
    if (!imageMedia) return null;
    
    // 提取图片 URL
    if (typeof imageMedia === 'string') {
        return imageMedia;
    }
    
    // 如果是字典，返回 url 或 src
    const url = imageMedia.url || imageMedia.src || '';
    
    // 如果是相对路径，转换为完整 URL
    if (url && !url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('data:') && !url.startsWith('//')) {
        // 相对路径，需要添加后端基础 URL
        // 如果以 / 开头，直接添加到当前域名；否则需要处理
        if (url.startsWith('/')) {
            return `${window.location.protocol}//${window.location.host}${url}`;
        }
        // 否则可能是相对于后端的路径，假设后端在 8086
        return `http://localhost:8086${url.startsWith('/') ? '' : '/'}${url}`;
    }
    
    return url || null;
};

const getOverlayStyle = expanded => {
    if (typeof window === 'undefined') {
        return {
            width: '100%',
            height: '100%',
            top: `${MENU_BAR_HEIGHT}px`,
            left: '0'
        };
    }
    const cardVerticalDragOffset = expanded ? 260 : 0;
    return {
        width: `${window.innerWidth + (2 * CARD_HORIZONTAL_DRAG_OFFSET)}px`,
        height: `${window.innerHeight - MENU_BAR_HEIGHT + cardVerticalDragOffset}px`,
        top: `${MENU_BAR_HEIGHT}px`,
        left: `${-CARD_HORIZONTAL_DRAG_OFFSET}px`
    };
};

const getDefaultPosition = (expanded = true) => {
    if (typeof window === 'undefined') return {x: 0, y: 0};
    const isRtl = typeof document !== 'undefined' && document.dir === 'rtl';
    const cardHorizontalDragOffset = CARD_HORIZONTAL_DRAG_OFFSET;
    let x = isRtl ? (-190 - WIDE_CARD_WIDTH - cardHorizontalDragOffset) : 292;
    x += cardHorizontalDragOffset;
    const tallCardHeight = expanded ? 360 : 220;
    const y = window.innerHeight - tallCardHeight - BOTTOM_MARGIN - MENU_BAR_HEIGHT;
    return {x, y};
};

const normalizeBilibiliSrc = src => {
    if (!src) return '';
    let url = src.trim();
    if (url.startsWith('//')) {
        url = `https:${url}`;
    } else if (!/^https?:\/\//i.test(url)) {
        url = `https://${url.replace(/^\/+/, '')}`;
    }
    if (url.includes('autoplay=')) {
        url = url.replace(/autoplay=\d/gi, 'autoplay=0');
    } else {
        url += url.includes('?') ? '&autoplay=0' : '?autoplay=0';
    }
    return url;
};

const ClassroomPanel = ({
    tutorial,
    visible,
    activeStepIndex,
    submission,
    onClose,
    onToggle,
    onNextStep,
    onPrevStep,
    onStepChange,
    onRequestSave,
    onViewExample
}) => {
    const [expanded, setExpanded] = useState(true);
    const [dragPosition, setDragPosition] = useState(() => getDefaultPosition(true));
    const tutorialKey = tutorial?.tutorialId ?? tutorial?.id ?? tutorial?.title ?? 'default';

    useEffect(() => {
        setDragPosition(getDefaultPosition(expanded));
    }, [tutorialKey, expanded]);

    useEffect(() => {
        if (!tutorial || !visible) return;
        classroomBridge.notifyReady({
            tutorialId: tutorial.tutorialId || tutorial.id,
            assignmentId: tutorial.assignmentId,
            activeStepIndex,
            expanded
        });
    }, [tutorialKey, visible, activeStepIndex, expanded, tutorial]);

    const steps = tutorial?.steps || [];
    const activeStep = steps[activeStepIndex] || steps[0];
    const totalSteps = steps.length;
    const formattedDueTime = formatDueTime(tutorial?.dueTime);
    const modeLabel = tutorial?.mode === 'assignment' ? '课堂作业' : '教学教程';
    const tags = tutorial?.tags || [];
    const mediaPreview = getStepMedia(activeStep);
    // 调试日志：输出 media 数据以便排查问题
    if (activeStep?.media && !mediaPreview) {
        // eslint-disable-next-line no-console
        console.log('[ClassroomPanel] 步骤媒体数据:', activeStep.media);
        // eslint-disable-next-line no-console
        console.log('[ClassroomPanel] 未找到图片，当前步骤:', activeStepIndex, activeStep?.title);
    }
    if (mediaPreview) {
        // eslint-disable-next-line no-console
        console.log('[ClassroomPanel] 找到图片URL:', mediaPreview);
    }
    const videoMedia = Array.isArray(activeStep?.media)
        ? activeStep.media.find(item => item?.type === 'video')
        : null;
    const overlayStyle = useMemo(() => getOverlayStyle(expanded), [expanded]);

    const handleDrag = (_, data) => {
        setDragPosition({x: data.x, y: data.y});
    };

    const handleToggleExpanded = () => {
        setExpanded(prev => !prev);
    };

    if (!tutorial) return null;

    if (!visible) {
        return (
            <button
                className={styles.collapsedBadge}
                onClick={onToggle}
            >
                {modeLabel}
            </button>
        );
    }

    const renderStepDots = () => {
        if (totalSteps <= 1) return null;
        return (
            <div className={cardStyles['steps-list']}>
                {steps.map((step, index) => (
                    <div
                        key={step?.id || `pip-${index}`}
                        className={index === activeStepIndex ? cardStyles['active-step-pip'] : cardStyles['inactiveStepPip']}
                        onClick={() => onStepChange(index)}
                        role="button"
                        tabIndex={0}
                        aria-label={`跳转第 ${index + 1} 步`}
                    />
                ))}
            </div>
        );
    };

    const renderNavButtons = () => {
        if (!expanded || totalSteps <= 1) {
            return null;
        }
        const disablePrev = activeStepIndex === 0;
        const disableNext = activeStepIndex >= totalSteps - 1;
        return (
            <>
                <div className={disablePrev ? cardStyles.hidden : cardStyles['left-card']} />
                <div
                    className={disablePrev ? cardStyles.hidden : cardStyles['left-button']}
                    onClick={() => {
                        if (!disablePrev) onPrevStep();
                    }}
                    role="button"
                    tabIndex={disablePrev ? -1 : 0}
                    aria-disabled={disablePrev}
                >
                    <img
                        draggable={false}
                        src={leftArrow}
                    />
                </div>
                <div className={disableNext ? cardStyles.hidden : cardStyles['right-card']} />
                <div
                    className={disableNext ? cardStyles.hidden : cardStyles['right-button']}
                    onClick={() => {
                        if (!disableNext) onNextStep();
                    }}
                    role="button"
                    tabIndex={disableNext ? -1 : 0}
                    aria-disabled={disableNext}
                >
                    <img
                        draggable={false}
                        src={rightArrow}
                    />
                </div>
            </>
        );
    };

    const stepContent = () => {
        if (!expanded) {
            return (
                <div className={styles.collapsedHint}>
                    点击“展开”查看课堂步骤
            </div>
            );
        }
        if (!activeStep && !totalSteps) {
            return <div className={styles.empty}>暂无步骤，请稍后再试</div>;
        }
        // 1:1像素级复刻官方引导卡：只包含标题和图片/视频
        // 官方ImageStep结构：标题 + 图片
        // 官方VideoStep结构：视频
        if (videoMedia) {
            // 如果有视频，显示视频（类似官方VideoStep）
            return (
                <div className={cardStyles['step-video']}>
                    <iframe
                        src={normalizeBilibiliSrc(videoMedia.embedUrl || videoMedia.url)}
                        title={videoMedia.title || '课堂视频'}
                        allowFullScreen
                        sandbox="allow-scripts allow-same-origin allow-pointer-lock"
                        referrerPolicy="no-referrer"
                        allow="fullscreen"
                        style={{height: '257px', width: '466px'}}
                    />
                </div>
            );
        }
        
        // 官方ImageStep结构：标题 + 图片
        return (
            <>
                <div className={cardStyles['step-title']}>
                    {activeStep?.title || `第 ${activeStepIndex + 1} 步`}
                </div>
                {mediaPreview ? (
                    <div className={cardStyles['step-image-container']}>
                        <img
                            className={cardStyles['step-image']}
                            src={mediaPreview}
                            alt="步骤示例"
                            draggable={false}
                            key={mediaPreview}
                        />
                    </div>
                ) : null}
            </>
        );
    };

    return (
        <div
            className={cardStyles.cardContainerOverlay}
            style={overlayStyle}
        >
            <Draggable
                bounds="parent"
                position={dragPosition}
                onDrag={handleDrag}
            >
                <div className={cardStyles.cardContainer}>
                    <div className={cardStyles.card}>
                        <div className={expanded ? cardStyles['header-buttons'] : classNames(cardStyles['header-buttons'], cardStyles['header-buttons-hidden'])}>
                            {/* 官方样式：左侧标题区域 */}
                            <div className={cardStyles['all-button']} style={{cursor: 'default', pointerEvents: 'none'}}>
                                {tutorial.assignmentTitle || tutorial.title || modeLabel}
                            </div>
                            {/* 官方样式：中间步骤圆点 */}
                            {renderStepDots()}
                            {/* 官方样式：右侧按钮区域 */}
                            <div className={cardStyles['header-buttons-right']}>
                                <div
                                    className={cardStyles['shrink-expand-button']}
                                    onClick={handleToggleExpanded}
                                >
                                    <img
                                        draggable={false}
                                        src={expanded ? shrinkIcon : expandIcon}
                                    />
                                    {expanded ? 'Shrink' : 'Expand'}
                                </div>
                                <div
                                    className={cardStyles['remove-button']}
                                    onClick={onClose}
                                >
                                    <img
                                        className={cardStyles['close-icon']}
                                        src={closeIcon}
                                    />
                                    Close
                                </div>
                            </div>
                        </div>
                        <div className={expanded ? cardStyles['step-body'] : cardStyles.hidden}>
                            {stepContent()}
                        </div>
                        {renderNavButtons()}
                    </div>
                </div>
            </Draggable>
        </div>
    );
};

ClassroomPanel.propTypes = {
    tutorial: PropTypes.shape({
        id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
        tutorialId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
        title: PropTypes.string,
        description: PropTypes.string,
        mode: PropTypes.string,
        estimatedMinutes: PropTypes.number,
        tags: PropTypes.arrayOf(PropTypes.string),
        steps: PropTypes.array,
        assignmentTitle: PropTypes.string,
        requirements: PropTypes.string,
        dueTime: PropTypes.string
    }),
    visible: PropTypes.bool,
    activeStepIndex: PropTypes.number,
    submission: PropTypes.shape({
        status: PropTypes.string,
        message: PropTypes.string,
        projectId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
        submissionId: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
    }),
    onClose: PropTypes.func,
    onToggle: PropTypes.func,
    onNextStep: PropTypes.func,
    onPrevStep: PropTypes.func,
    onStepChange: PropTypes.func,
    onRequestSave: PropTypes.func,
    onViewExample: PropTypes.func
};

export default ClassroomPanel;

