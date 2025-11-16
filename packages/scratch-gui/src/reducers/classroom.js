import {combineReducers} from 'redux';

const getSubmissionInitialState = () => ({
    status: 'idle', // idle | saving | success | error
    message: null,
    projectId: null,
    submissionId: null,
    updatedAt: null
});

export const classroomInitialState = {
    tutorial: null,
    visible: true,
    lastUpdated: null,
    activeStepIndex: 0,
    submission: getSubmissionInitialState()
};

const tutorial = (state = classroomInitialState.tutorial, action) => {
    switch (action.type) {
    case 'SET_CLASSROOM_TUTORIAL':
        return action.tutorial;
    default:
        return state;
    }
};

const visible = (state = classroomInitialState.visible, action) => {
    switch (action.type) {
    case 'SET_CLASSROOM_VISIBLE':
        return action.visible;
    case 'SET_CLASSROOM_TUTORIAL':
        return true;
    default:
        return state;
    }
};

const activeStepIndex = (state = classroomInitialState.activeStepIndex, action) => {
    switch (action.type) {
    case 'SET_CLASSROOM_TUTORIAL':
        return 0;
    case 'SET_CLASSROOM_ACTIVE_STEP':
        return Math.max(0, action.index || 0);
    default:
        return state;
    }
};

const lastUpdated = (state = classroomInitialState.lastUpdated, action) => {
    switch (action.type) {
    case 'SET_CLASSROOM_TUTORIAL':
        return Date.now();
    default:
        return state;
    }
};

const submission = (state = classroomInitialState.submission, action) => {
    switch (action.type) {
    case 'SET_CLASSROOM_TUTORIAL':
    case 'RESET_CLASSROOM_SUBMISSION':
        return getSubmissionInitialState();
    case 'SET_CLASSROOM_SUBMISSION_STATUS':
        return {
            ...state,
            ...action.payload,
            updatedAt: Date.now()
        };
    default:
        return state;
    }
};

export default combineReducers({
    tutorial,
    visible,
    lastUpdated,
    activeStepIndex,
    submission
});

export const setClassroomTutorial = tutorial => ({
    type: 'SET_CLASSROOM_TUTORIAL',
    tutorial
});

export const setClassroomVisible = visible => ({
    type: 'SET_CLASSROOM_VISIBLE',
    visible
});

export const setClassroomActiveStep = index => ({
    type: 'SET_CLASSROOM_ACTIVE_STEP',
    index
});

export const setClassroomSubmissionStatus = payload => ({
    type: 'SET_CLASSROOM_SUBMISSION_STATUS',
    payload
});

export const resetClassroomSubmission = () => ({
    type: 'RESET_CLASSROOM_SUBMISSION'
});

