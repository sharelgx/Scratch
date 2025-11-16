import classNames from 'classnames';
import PropTypes from 'prop-types';
import React, {useEffect, useMemo, useRef, useState} from 'react';
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
    const contentRef = useRef(null);

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
    const submissionStatus = submission?.status || 'idle';
    const isSaving = submissionStatus === 'saving';
    const isSuccess = submissionStatus === 'success';
    const isError = submissionStatus === 'error';
    const statusLabel = (() => {
        if (isSaving) return '正在保存…';
        if (isSuccess) return '保存成功';
        if (isError) return '保存失败';
        switch (submissionStatus) {
        case 'submitted':
            return '已提交';
        case 'saved':
            return '已保存';
        default:
            return null;
        }
    })();
    const statusTone = (() => {
        if (isSaving) return 'saving';
        if (isSuccess) return 'success';
        if (isError) return 'error';
        if (submissionStatus === 'submitted') return 'success';
        return null;
    })();

    const overlayStyle = useMemo(() => getOverlayStyle(expanded), [expanded]);

    const handleDrag = (_, data) => {
        setDragPosition({x: data.x, y: data.y});
    };

    const handleRequestSave = () => {
        if (isSaving) return;
        onRequestSave?.(activeStepIndex);
    };

    const handleToggleExpanded = () => {
        setExpanded(prev => !prev);
    };

    useEffect(() => {
        if (!contentRef.current) return;
        const iframeNodes = contentRef.current.querySelectorAll('iframe');
        iframeNodes.forEach(iframe => {
            const src = iframe.getAttribute('src') || '';
            if (!src || !/bilibili\.com/i.test(src)) return;
            iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-pointer-lock allowfullscreen');
            iframe.setAttribute('referrerpolicy', 'no-referrer');
            iframe.setAttribute('allowfullscreen', 'true');
            iframe.setAttribute('allow', 'fullscreen');
        });
    }, [tutorialKey, activeStepIndex, activeStep?.content]);

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
            <div className={cardStyles.stepsList}>
                {steps.map((step, index) => (
                    <div
                        key={step?.id || `pip-${index}`}
                        className={index === activeStepIndex ? cardStyles.activeStepPip : cardStyles.inactiveStepPip}
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
                <div className={disablePrev ? cardStyles.hidden : cardStyles.leftCard} />
                <div
                    className={disablePrev ? cardStyles.hidden : cardStyles.leftButton}
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
                <div className={disableNext ? cardStyles.hidden : cardStyles.rightCard} />
                <div
                    className={disableNext ? cardStyles.hidden : cardStyles.rightButton}
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
        return (
            <>
                <div className={styles.stepTitle}>{activeStep?.title || `第 ${activeStepIndex + 1} 步`}</div>
                {mediaPreview ? (
                    <div className={styles.stepMedia}>
                        <img src={mediaPreview} alt="步骤示例" />
            </div>
                ) : (
                    <div className={styles.stepMediaPlaceholder}>无示例图</div>
                )}
                {videoMedia ? (
                    <div className={styles.stepVideo}>
                        <iframe
                            src={normalizeBilibiliSrc(videoMedia.embedUrl)}
                            title={videoMedia.title || '课堂视频'}
                            allowFullScreen
                            sandbox="allow-scripts allow-same-origin allow-pointer-lock allowfullscreen"
                            referrerPolicy="no-referrer"
                            allow="fullscreen"
                        />
                    </div>
                ) : null}
                <div className={styles.stepDescription}>
                    {activeStep?.content ? (
                            <div
                            className={styles.stepRichContent}
                            ref={contentRef}
                            dangerouslySetInnerHTML={{__html: activeStep.content}}
                            />
                        ) : (
                            <div className={styles.stepContentPlaceholder}>
                            教师尚未提供此步骤说明
                            </div>
                        )}
                </div>
                <div className={styles.ctaRow}>
                    <button
                        className={styles.secondaryButton}
                        onClick={() => onViewExample?.(tutorial)}
                    >
                        查看示例
                    </button>
                    <button
                        className={classNames(styles.primaryButton, {
                            [styles.primaryButtonSaving]: isSaving,
                            [styles.primaryButtonSuccess]: isSuccess
                        })}
                        onClick={handleRequestSave}
                        disabled={isSaving}
                    >
                        {isSaving ? '保存中…' : (isSuccess ? '已提交' : '提交作业')}
                    </button>
                </div>
                {(statusLabel || submission?.message) ? (
                    <div
                        className={classNames(styles.statusMessage, {
                            [styles.statusSuccess]: isSuccess,
                            [styles.statusError]: isError
                        })}
                    >
                        {submission?.message || statusLabel || (isSuccess ? '作品已成功保存，老师可见' : '提交失败，请稍后重试')}
                    </div>
                ) : null}
                <div
                    className={styles.statusRow}
                    aria-live="polite"
                    aria-atomic="true"
                >
                    {statusLabel ? (
                        <span
                            className={classNames(
                                styles.statusChip,
                                {
                                    [styles.statusChipSaving]: statusTone === 'saving',
                                    [styles.statusChipSuccess]: statusTone === 'success',
                                    [styles.statusChipError]: statusTone === 'error'
                                }
                            )}
                        >
                            {statusLabel}
                        </span>
                    ) : (
                        <span className={styles.statusChipMuted}>等待操作</span>
                    )}
                </div>
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
                        <div className={cardStyles.headerButtons}>
                            <div className={styles.headerContent}>
                                <div className={styles.modeAndTitle}>
                                    <span className={styles.modeTag}>{modeLabel}</span>
                                    <div className={styles.assignmentTitle}>{tutorial.assignmentTitle || tutorial.title || '课堂作业'}</div>
                                </div>
                                {tutorial.description ? (
                                    <div className={styles.subTitle}>{tutorial.description}</div>
                                ) : null}
                                <div className={styles.metaRow}>
                                    {tutorial.estimatedMinutes ? (
                                        <span className={styles.metaItem}>{tutorial.estimatedMinutes} 分钟</span>
                                    ) : null}
                                    {formattedDueTime ? (
                                        <span className={styles.metaItem}>截止 {formattedDueTime}</span>
                                    ) : null}
                                    {tutorial.requirements ? (
                                        <span className={styles.metaItem}>要求：{tutorial.requirements}</span>
                                    ) : null}
                                </div>
                                {tags.length ? (
                                    <div className={styles.tagList}>
                                        {tags.map(tag => (
                                            <span key={tag} className={styles.tagPill}>{tag}</span>
                ))}
            </div>
                                ) : null}
                                {renderStepDots()}
                            </div>
                            <div className={cardStyles.headerButtonsRight}>
                                <button
                                    className={styles.headerAction}
                                    onClick={handleToggleExpanded}
                                >
                                    <img
                                        draggable={false}
                                        src={expanded ? shrinkIcon : expandIcon}
                                    />
                                    {expanded ? '收起' : '展开'}
                                </button>
            <button
                                    className={styles.headerAction}
                                    onClick={onClose}
            >
                                    <img
                                        draggable={false}
                                        src={closeIcon}
                                    />
                                    关闭
            </button>
                            </div>
                        </div>
                        <div className={expanded ? cardStyles.stepBody : cardStyles.hidden}>
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

