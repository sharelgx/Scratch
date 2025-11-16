import {connect} from 'react-redux';
import ClassroomPanelComponent from '../components/classroom-panel/classroom-panel.jsx';
import classroomBridge from '../lib/classroom-bridge';
import {
    setClassroomVisible,
    setClassroomActiveStep,
    setClassroomSubmissionStatus
} from '../reducers/classroom';

const mapStateToProps = state => ({
    tutorial: state.scratchGui.classroom.tutorial,
    visible: state.scratchGui.classroom.visible,
    activeStepIndex: state.scratchGui.classroom.activeStepIndex,
    submission: state.scratchGui.classroom.submission
});

const mapDispatchToProps = dispatch => ({
    setVisible: visible => dispatch(setClassroomVisible(visible)),
    setActiveStep: index => dispatch(setClassroomActiveStep(index)),
    setSubmissionStatus: payload => dispatch(setClassroomSubmissionStatus(payload))
});

const mergeProps = (stateProps, dispatchProps, ownProps) => ({
    ...ownProps,
    ...stateProps,
    onClose: () => dispatchProps.setVisible(false),
    onToggle: () => dispatchProps.setVisible(!stateProps.visible),
    onStepChange: index => {
        if (typeof index !== 'number') return;
        const stepsLength = stateProps.tutorial?.steps?.length || 0;
        if (stepsLength === 0) return;
        const clamped = Math.max(0, Math.min(index, stepsLength - 1));
        dispatchProps.setActiveStep(clamped);
    },
    onNextStep: () => {
        const nextIndex = stateProps.activeStepIndex + 1;
        const maxIndex = (stateProps.tutorial?.steps?.length || 1) - 1;
        dispatchProps.setActiveStep(Math.min(nextIndex, Math.max(0, maxIndex)));
    },
    onPrevStep: () => {
        dispatchProps.setActiveStep(Math.max(0, stateProps.activeStepIndex - 1));
    },
    onRequestSave: () => {
        if (!stateProps.tutorial) return;
        dispatchProps.setSubmissionStatus({
            status: 'saving',
            message: '正在保存作品…',
            projectId: null,
            submissionId: null
        });
        classroomBridge.requestSave({
            tutorialId: stateProps.tutorial.tutorialId || stateProps.tutorial.id,
            assignmentId: stateProps.tutorial.assignmentId,
            stepIndex: stateProps.activeStepIndex
        });
    },
    onViewExample: () => {
        const steps = stateProps.tutorial?.steps || [];
        const activeStep = steps[stateProps.activeStepIndex] || null;
        const mediaList = activeStep?.media || [];
        const preview = mediaList.find(item => item?.type === 'image' ||
            (typeof item?.mime === 'string' && item.mime.includes('image')));
        const url = preview?.url || preview?.src;
        if (url) {
            window.open(url, '_blank', 'noopener');
        }
    }
});

export default connect(
    mapStateToProps,
    mapDispatchToProps,
    mergeProps
)(ClassroomPanelComponent);

