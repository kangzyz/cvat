// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import {
    QualityControlActions,
    QualityControlActionTypes,
} from 'actions/quality-control-actions';
import { QualityControlState } from '.';

const defaultState: QualityControlState = {
    resourceKey: null,
    initialized: false,
    fetching: false,
    error: null,
    instance: null,
    instanceType: null,
    tasks: [],
    jobs: [],
    gtJob: null,
    gtJobMeta: null,
    validationLayout: null,
    issues: [],
    settings: {
        current: null,
        parent: null,
        children: [],
        saving: false,
        justSaved: false,
        error: null,
    },
    reports: {
        history: [],
        selectedID: null,
        detailsByID: {},
        conflictsByReportID: {},
        refreshing: false,
        error: null,
    },
    calculation: {
        request: null,
        submitting: false,
        error: null,
    },
    validationSaving: false,
};

function isCurrentResource(state: QualityControlState, action: QualityControlActions): boolean {
    return !('payload' in action) || !('resourceKey' in action.payload) ||
        action.payload.resourceKey === state.resourceKey;
}

export default function qualityControlReducer(
    state: QualityControlState = defaultState,
    action: QualityControlActions,
): QualityControlState {
    if (action.type === QualityControlActionTypes.INITIALIZE) {
        return {
            ...defaultState,
            resourceKey: action.payload.resourceKey,
            fetching: true,
        };
    }

    if (!isCurrentResource(state, action)) {
        return state;
    }

    switch (action.type) {
        case QualityControlActionTypes.RESET:
            return { ...defaultState };
        case QualityControlActionTypes.INITIALIZE_SUCCESS: {
            const { data } = action.payload;
            return {
                ...state,
                initialized: true,
                fetching: false,
                instance: data.instance,
                instanceType: data.instanceType,
                tasks: data.tasks,
                jobs: data.jobs,
                gtJob: data.gtJob,
                gtJobMeta: data.gtJobMeta,
                validationLayout: data.validationLayout,
                issues: data.issues,
                settings: {
                    ...state.settings,
                    current: data.settings,
                    parent: data.parentSettings,
                    children: data.childrenSettings,
                },
                reports: {
                    ...state.reports,
                    history: data.history,
                    selectedID: data.history[0]?.id || null,
                },
            };
        }
        case QualityControlActionTypes.INITIALIZE_FAILED:
            return {
                ...state,
                initialized: true,
                fetching: false,
                error: action.payload.error,
            };
        case QualityControlActionTypes.REFRESH_REPORTS:
            return {
                ...state,
                reports: { ...state.reports, refreshing: true, error: null },
            };
        case QualityControlActionTypes.REFRESH_REPORTS_SUCCESS:
            return {
                ...state,
                reports: {
                    ...state.reports,
                    history: action.payload.history,
                    refreshing: false,
                    error: null,
                },
            };
        case QualityControlActionTypes.REFRESH_REPORTS_FAILED:
            return {
                ...state,
                reports: {
                    ...state.reports,
                    refreshing: false,
                    error: action.payload.error,
                },
            };
        case QualityControlActionTypes.SELECT_REPORT:
            return {
                ...state,
                reports: { ...state.reports, selectedID: action.payload.reportID },
            };
        case QualityControlActionTypes.LOAD_REPORT_DETAILS:
            return {
                ...state,
                reports: {
                    ...state.reports,
                    detailsByID: {
                        ...state.reports.detailsByID,
                        [action.payload.reportID]: {
                            children: [],
                            jobReports: [],
                            fetching: true,
                            error: null,
                        },
                    },
                },
            };
        case QualityControlActionTypes.LOAD_REPORT_DETAILS_SUCCESS:
            return {
                ...state,
                reports: {
                    ...state.reports,
                    detailsByID: {
                        ...state.reports.detailsByID,
                        [action.payload.reportID]: {
                            children: action.payload.children,
                            jobReports: action.payload.jobReports,
                            fetching: false,
                            error: null,
                        },
                    },
                },
            };
        case QualityControlActionTypes.LOAD_REPORT_DETAILS_FAILED:
            return {
                ...state,
                reports: {
                    ...state.reports,
                    detailsByID: {
                        ...state.reports.detailsByID,
                        [action.payload.reportID]: {
                            children: [],
                            jobReports: [],
                            fetching: false,
                            error: action.payload.error,
                        },
                    },
                },
            };
        case QualityControlActionTypes.LOAD_CONFLICTS:
            return {
                ...state,
                reports: {
                    ...state.reports,
                    conflictsByReportID: {
                        ...state.reports.conflictsByReportID,
                        [action.payload.reportID]: {
                            items: [],
                            fetching: true,
                            error: null,
                        },
                    },
                },
            };
        case QualityControlActionTypes.LOAD_CONFLICTS_SUCCESS:
            return {
                ...state,
                reports: {
                    ...state.reports,
                    conflictsByReportID: {
                        ...state.reports.conflictsByReportID,
                        [action.payload.reportID]: {
                            items: action.payload.conflicts,
                            fetching: false,
                            error: null,
                        },
                    },
                },
            };
        case QualityControlActionTypes.LOAD_CONFLICTS_FAILED:
            return {
                ...state,
                reports: {
                    ...state.reports,
                    conflictsByReportID: {
                        ...state.reports.conflictsByReportID,
                        [action.payload.reportID]: {
                            items: [],
                            fetching: false,
                            error: action.payload.error,
                        },
                    },
                },
            };
        case QualityControlActionTypes.CALCULATE:
            return {
                ...state,
                calculation: { request: null, submitting: true, error: null },
            };
        case QualityControlActionTypes.CALCULATION_PROGRESS:
            return {
                ...state,
                calculation: { request: action.payload.request, submitting: false, error: null },
            };
        case QualityControlActionTypes.CALCULATION_SUCCESS:
            return {
                ...state,
                calculation: { request: action.payload.request, submitting: false, error: null },
                settings: { ...state.settings, justSaved: false },
            };
        case QualityControlActionTypes.CALCULATION_FAILED:
            return {
                ...state,
                calculation: { ...state.calculation, submitting: false, error: action.payload.error },
            };
        case QualityControlActionTypes.SAVE_SETTINGS:
            return {
                ...state,
                settings: {
                    ...state.settings, saving: true, justSaved: false, error: null,
                },
            };
        case QualityControlActionTypes.SAVE_SETTINGS_SUCCESS:
            return {
                ...state,
                settings: {
                    current: action.payload.settings,
                    parent: state.settings.parent,
                    children: action.payload.childrenSettings,
                    saving: false,
                    justSaved: true,
                    error: null,
                },
            };
        case QualityControlActionTypes.SAVE_SETTINGS_FAILED:
            return {
                ...state,
                settings: {
                    ...state.settings,
                    saving: false,
                    error: action.payload.error,
                },
            };
        case QualityControlActionTypes.DISMISS_SETTINGS_SAVED:
            return {
                ...state,
                settings: { ...state.settings, justSaved: false },
            };
        case QualityControlActionTypes.UPDATE_VALIDATION:
            return { ...state, validationSaving: true };
        case QualityControlActionTypes.UPDATE_VALIDATION_SUCCESS:
            return {
                ...state,
                validationSaving: false,
                instance: action.payload.instance,
                jobs: action.payload.instance.jobs,
                gtJob: action.payload.gtJob,
                gtJobMeta: action.payload.gtJobMeta,
                validationLayout: action.payload.validationLayout,
            };
        case QualityControlActionTypes.UPDATE_VALIDATION_FAILED:
            return { ...state, validationSaving: false };
        default:
            return state;
    }
}
