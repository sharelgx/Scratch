import classNames from 'classnames';
import {connect} from 'react-redux';
import PropTypes from 'prop-types';
import React, {useEffect} from 'react';
import {defineMessages, useIntl} from 'react-intl';
import {setProjectTitle} from '../../reducers/project-title';

import BufferedInputHOC from '../forms/buffered-input-hoc.jsx';
import Input from '../forms/input.jsx';
const BufferedInput = BufferedInputHOC(Input);

import styles from './project-title-input.css';

const messages = defineMessages({
    projectTitlePlaceholder: {
        id: 'gui.gui.projectTitlePlaceholder',
        description: 'Placeholder for project title when blank',
        defaultMessage: 'Project title here'
    }
});

const ProjectTitleInput = ({
    className,
    onSubmit,
    projectTitle
}) => {
    const intl = useIntl();

    useEffect(() => {
        const trimmedTitle = (projectTitle || '').trim();

        try {
            window.__scratchCurrentProjectTitle = trimmedTitle;
        } catch (e) {
            // ignore assignment errors
        }

        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({
                    type: 'SCRATCH_PROJECT_TITLE_UPDATE',
                    data: {
                        title: trimmedTitle,
                        timestamp: new Date().toISOString()
                    }
                }, '*');
            }
        } catch (error) {
            console.warn('⚠️ 无法发送项目标题更新到父窗口:', error);
        }
    }, [projectTitle]);

    return (
        <BufferedInput
            className={classNames(styles.titleField, className)}
            maxLength="100"
            placeholder={intl.formatMessage(messages.projectTitlePlaceholder)}
            tabIndex="0"
            type="text"
            value={projectTitle}
            onSubmit={onSubmit}
        />
    );
};

ProjectTitleInput.propTypes = {
    className: PropTypes.string,
    onSubmit: PropTypes.func,
    projectTitle: PropTypes.string
};

const mapStateToProps = state => ({
    projectTitle: state.scratchGui.projectTitle
});

const mapDispatchToProps = dispatch => ({
    onSubmit: title => dispatch(setProjectTitle(title))
});

export default connect(mapStateToProps, mapDispatchToProps)(ProjectTitleInput);
