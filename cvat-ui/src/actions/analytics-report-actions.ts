// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import {
    getCore,
    ResourceAnalyticsActivity,
    ResourceAnalyticsActivityFilter,
    ResourceAnalyticsAnnotations,
    ResourceAnalyticsEvents,
    ResourceAnalyticsEventsFilter,
    ResourceAnalyticsExportFilter,
    ResourceAnalyticsOverview,
    ResourceAnalyticsType,
} from 'cvat-core-wrapper';
import { ActionUnion, createAction, ThunkAction } from 'utils/redux';

const core = getCore();

export enum AnalyticsReportActionTypes {
    RESET = 'ANALYTICS_REPORT_RESET',
    GET_OVERVIEW = 'ANALYTICS_REPORT_GET_OVERVIEW',
    GET_OVERVIEW_SUCCESS = 'ANALYTICS_REPORT_GET_OVERVIEW_SUCCESS',
    GET_OVERVIEW_FAILED = 'ANALYTICS_REPORT_GET_OVERVIEW_FAILED',
    GET_ANNOTATIONS = 'ANALYTICS_REPORT_GET_ANNOTATIONS',
    GET_ANNOTATIONS_SUCCESS = 'ANALYTICS_REPORT_GET_ANNOTATIONS_SUCCESS',
    GET_ANNOTATIONS_FAILED = 'ANALYTICS_REPORT_GET_ANNOTATIONS_FAILED',
    GET_ACTIVITY = 'ANALYTICS_REPORT_GET_ACTIVITY',
    GET_ACTIVITY_SUCCESS = 'ANALYTICS_REPORT_GET_ACTIVITY_SUCCESS',
    GET_ACTIVITY_FAILED = 'ANALYTICS_REPORT_GET_ACTIVITY_FAILED',
    GET_EVENTS = 'ANALYTICS_REPORT_GET_EVENTS',
    GET_EVENTS_SUCCESS = 'ANALYTICS_REPORT_GET_EVENTS_SUCCESS',
    GET_EVENTS_FAILED = 'ANALYTICS_REPORT_GET_EVENTS_FAILED',
    EXPORT_EVENTS = 'ANALYTICS_REPORT_EXPORT_EVENTS',
    EXPORT_EVENTS_SUCCESS = 'ANALYTICS_REPORT_EXPORT_EVENTS_SUCCESS',
    EXPORT_EVENTS_FAILED = 'ANALYTICS_REPORT_EXPORT_EVENTS_FAILED',
}

type Target = { resourceType: ResourceAnalyticsType; resourceID: number };

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function requestKey(filter: object): string {
    return JSON.stringify(filter, Object.keys(filter).sort());
}

export const analyticsReportActions = {
    reset: () => createAction(AnalyticsReportActionTypes.RESET),
    getOverview: (target: Target) => createAction(AnalyticsReportActionTypes.GET_OVERVIEW, target),
    getOverviewSuccess: (target: Target, data: ResourceAnalyticsOverview) => (
        createAction(AnalyticsReportActionTypes.GET_OVERVIEW_SUCCESS, { ...target, data })
    ),
    getOverviewFailed: (target: Target, error: string) => (
        createAction(AnalyticsReportActionTypes.GET_OVERVIEW_FAILED, { ...target, error })
    ),
    getAnnotations: (target: Target) => createAction(AnalyticsReportActionTypes.GET_ANNOTATIONS, target),
    getAnnotationsSuccess: (target: Target, data: ResourceAnalyticsAnnotations) => (
        createAction(AnalyticsReportActionTypes.GET_ANNOTATIONS_SUCCESS, { ...target, data })
    ),
    getAnnotationsFailed: (target: Target, error: string) => (
        createAction(AnalyticsReportActionTypes.GET_ANNOTATIONS_FAILED, { ...target, error })
    ),
    getActivity: (target: Target, key: string) => (
        createAction(AnalyticsReportActionTypes.GET_ACTIVITY, { ...target, key })
    ),
    getActivitySuccess: (target: Target, key: string, data: ResourceAnalyticsActivity) => (
        createAction(AnalyticsReportActionTypes.GET_ACTIVITY_SUCCESS, { ...target, key, data })
    ),
    getActivityFailed: (target: Target, key: string, error: string) => (
        createAction(AnalyticsReportActionTypes.GET_ACTIVITY_FAILED, { ...target, key, error })
    ),
    getEvents: (target: Target, key: string) => (
        createAction(AnalyticsReportActionTypes.GET_EVENTS, { ...target, key })
    ),
    getEventsSuccess: (target: Target, key: string, data: ResourceAnalyticsEvents) => (
        createAction(AnalyticsReportActionTypes.GET_EVENTS_SUCCESS, { ...target, key, data })
    ),
    getEventsFailed: (target: Target, key: string, error: string) => (
        createAction(AnalyticsReportActionTypes.GET_EVENTS_FAILED, { ...target, key, error })
    ),
    exportEvents: (target: Target) => createAction(AnalyticsReportActionTypes.EXPORT_EVENTS, target),
    exportEventsSuccess: (target: Target) => (
        createAction(AnalyticsReportActionTypes.EXPORT_EVENTS_SUCCESS, target)
    ),
    exportEventsFailed: (target: Target, error: string) => (
        createAction(AnalyticsReportActionTypes.EXPORT_EVENTS_FAILED, { ...target, error })
    ),
};

export type AnalyticsReportActions = ActionUnion<typeof analyticsReportActions>;

export const getAnalyticsOverviewAsync = (
    resourceType: ResourceAnalyticsType,
    resourceID: number,
): ThunkAction => async (dispatch) => {
    const target = { resourceType, resourceID };
    dispatch(analyticsReportActions.getOverview(target));
    try {
        const data = await core.analytics.resources.overview(resourceType, resourceID);
        dispatch(analyticsReportActions.getOverviewSuccess(target, data));
    } catch (error) {
        dispatch(analyticsReportActions.getOverviewFailed(target, errorMessage(error)));
    }
};

export const getAnalyticsAnnotationsAsync = (
    resourceType: ResourceAnalyticsType,
    resourceID: number,
): ThunkAction => async (dispatch) => {
    const target = { resourceType, resourceID };
    dispatch(analyticsReportActions.getAnnotations(target));
    try {
        const data = await core.analytics.resources.annotations(resourceType, resourceID);
        dispatch(analyticsReportActions.getAnnotationsSuccess(target, data));
    } catch (error) {
        dispatch(analyticsReportActions.getAnnotationsFailed(target, errorMessage(error)));
    }
};

export const getAnalyticsActivityAsync = (
    resourceType: ResourceAnalyticsType,
    resourceID: number,
    filter: ResourceAnalyticsActivityFilter,
): ThunkAction => async (dispatch) => {
    const target = { resourceType, resourceID };
    const key = requestKey(filter);
    dispatch(analyticsReportActions.getActivity(target, key));
    try {
        const data = await core.analytics.resources.activity(resourceType, resourceID, filter);
        dispatch(analyticsReportActions.getActivitySuccess(target, key, data));
    } catch (error) {
        dispatch(analyticsReportActions.getActivityFailed(target, key, errorMessage(error)));
    }
};

export const getAnalyticsEventsAsync = (
    resourceType: ResourceAnalyticsType,
    resourceID: number,
    filter: ResourceAnalyticsEventsFilter,
): ThunkAction => async (dispatch) => {
    const target = { resourceType, resourceID };
    const key = requestKey(filter);
    dispatch(analyticsReportActions.getEvents(target, key));
    try {
        const data = await core.analytics.resources.events(resourceType, resourceID, filter);
        dispatch(analyticsReportActions.getEventsSuccess(target, key, data));
    } catch (error) {
        dispatch(analyticsReportActions.getEventsFailed(target, key, errorMessage(error)));
    }
};

export const exportAnalyticsEventsAsync = (
    resourceType: ResourceAnalyticsType,
    resourceID: number,
    filter: ResourceAnalyticsExportFilter,
): ThunkAction<Promise<string>> => async (dispatch) => {
    const target = { resourceType, resourceID };
    dispatch(analyticsReportActions.exportEvents(target));
    try {
        const requestID = await core.analytics.resources.exportEvents(resourceType, resourceID, filter);
        const request = await core.requests.listen(requestID, { callback: () => undefined });
        if (!request.url) {
            throw new Error();
        }
        dispatch(analyticsReportActions.exportEventsSuccess(target));
        return request.url;
    } catch (error) {
        dispatch(analyticsReportActions.exportEventsFailed(target, errorMessage(error)));
        throw error;
    }
};
