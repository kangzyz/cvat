// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import {
    AnalyticsReportActions,
    AnalyticsReportActionTypes,
} from 'actions/analytics-report-actions';
import { AnalyticsReportState } from '.';

const emptySection = {
    data: null,
    fetching: false,
    error: null,
};

const defaultState: AnalyticsReportState = {
    resourceType: null,
    resourceID: null,
    overview: { ...emptySection },
    annotations: { ...emptySection },
    activity: { ...emptySection, requestKey: null },
    events: { ...emptySection, requestKey: null },
    export: {
        fetching: false,
        error: null,
    },
};

function isCurrentTarget(state: AnalyticsReportState, payload: {
    resourceType: string;
    resourceID: number;
}): boolean {
    return state.resourceType === payload.resourceType && state.resourceID === payload.resourceID;
}

function stateForTarget(state: AnalyticsReportState, payload: {
    resourceType: AnalyticsReportState['resourceType'];
    resourceID: number;
}): AnalyticsReportState {
    if (isCurrentTarget(state, payload)) {
        return state;
    }
    return {
        ...defaultState,
        resourceType: payload.resourceType,
        resourceID: payload.resourceID,
        overview: { ...emptySection },
        annotations: { ...emptySection },
        activity: { ...emptySection, requestKey: null },
        events: { ...emptySection, requestKey: null },
        export: { ...defaultState.export },
    };
}

export default (
    state: AnalyticsReportState = defaultState,
    action: AnalyticsReportActions,
): AnalyticsReportState => {
    switch (action.type) {
        case AnalyticsReportActionTypes.RESET:
            return defaultState;
        case AnalyticsReportActionTypes.GET_OVERVIEW: {
            const targetState = stateForTarget(state, action.payload);
            return {
                ...targetState,
                overview: { ...targetState.overview, fetching: true, error: null },
            };
        }
        case AnalyticsReportActionTypes.GET_OVERVIEW_SUCCESS:
        case AnalyticsReportActionTypes.GET_OVERVIEW_FAILED: {
            if (!isCurrentTarget(state, action.payload)) return state;
            return {
                ...state,
                overview: {
                    data: action.type === AnalyticsReportActionTypes.GET_OVERVIEW_SUCCESS ?
                        action.payload.data : state.overview.data,
                    fetching: false,
                    error: action.type === AnalyticsReportActionTypes.GET_OVERVIEW_FAILED ?
                        action.payload.error : null,
                },
            };
        }
        case AnalyticsReportActionTypes.GET_ANNOTATIONS: {
            const targetState = stateForTarget(state, action.payload);
            return {
                ...targetState,
                annotations: { ...targetState.annotations, fetching: true, error: null },
            };
        }
        case AnalyticsReportActionTypes.GET_ANNOTATIONS_SUCCESS:
        case AnalyticsReportActionTypes.GET_ANNOTATIONS_FAILED: {
            if (!isCurrentTarget(state, action.payload)) return state;
            return {
                ...state,
                annotations: {
                    data: action.type === AnalyticsReportActionTypes.GET_ANNOTATIONS_SUCCESS ?
                        action.payload.data : state.annotations.data,
                    fetching: false,
                    error: action.type === AnalyticsReportActionTypes.GET_ANNOTATIONS_FAILED ?
                        action.payload.error : null,
                },
            };
        }
        case AnalyticsReportActionTypes.GET_ACTIVITY: {
            const targetState = stateForTarget(state, action.payload);
            return {
                ...targetState,
                activity: {
                    ...targetState.activity,
                    fetching: true,
                    error: null,
                    requestKey: action.payload.key,
                },
            };
        }
        case AnalyticsReportActionTypes.GET_ACTIVITY_SUCCESS:
        case AnalyticsReportActionTypes.GET_ACTIVITY_FAILED: {
            if (!isCurrentTarget(state, action.payload) || state.activity.requestKey !== action.payload.key) {
                return state;
            }
            return {
                ...state,
                activity: {
                    data: action.type === AnalyticsReportActionTypes.GET_ACTIVITY_SUCCESS ?
                        action.payload.data : state.activity.data,
                    fetching: false,
                    error: action.type === AnalyticsReportActionTypes.GET_ACTIVITY_FAILED ?
                        action.payload.error : null,
                    requestKey: action.payload.key,
                },
            };
        }
        case AnalyticsReportActionTypes.GET_EVENTS: {
            const targetState = stateForTarget(state, action.payload);
            return {
                ...targetState,
                events: {
                    ...targetState.events,
                    fetching: true,
                    error: null,
                    requestKey: action.payload.key,
                },
            };
        }
        case AnalyticsReportActionTypes.GET_EVENTS_SUCCESS:
        case AnalyticsReportActionTypes.GET_EVENTS_FAILED: {
            if (!isCurrentTarget(state, action.payload) || state.events.requestKey !== action.payload.key) {
                return state;
            }
            return {
                ...state,
                events: {
                    data: action.type === AnalyticsReportActionTypes.GET_EVENTS_SUCCESS ?
                        action.payload.data : state.events.data,
                    fetching: false,
                    error: action.type === AnalyticsReportActionTypes.GET_EVENTS_FAILED ?
                        action.payload.error : null,
                    requestKey: action.payload.key,
                },
            };
        }
        case AnalyticsReportActionTypes.EXPORT_EVENTS: {
            const targetState = stateForTarget(state, action.payload);
            return { ...targetState, export: { fetching: true, error: null } };
        }
        case AnalyticsReportActionTypes.EXPORT_EVENTS_SUCCESS:
        case AnalyticsReportActionTypes.EXPORT_EVENTS_FAILED: {
            if (!isCurrentTarget(state, action.payload)) return state;
            return {
                ...state,
                export: {
                    fetching: false,
                    error: action.type === AnalyticsReportActionTypes.EXPORT_EVENTS_FAILED ?
                        action.payload.error : null,
                },
            };
        }
        default:
            return state;
    }
};
