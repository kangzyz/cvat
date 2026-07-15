// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import {
    FramesMetaData,
    Issue,
    Job,
    JobType,
    Project,
    QualityConflict,
    QualityReport,
    QualitySettings,
    QualitySettingsSaveFields,
    Request,
    RQStatus,
    Task,
    TaskValidationLayout,
    getCore,
} from 'cvat-core-wrapper';
import { InstanceType } from 'reducers';
import { ActionUnion, createAction, ThunkAction } from 'utils/redux';
import { updateRequestProgress } from './requests-actions';

const core = getCore();

export type UpdateQualitySettingsData = Record<number, {
    settings: QualitySettings;
    fields: QualitySettingsSaveFields;
}>;

interface InitializationData {
    instance: Project | Task;
    instanceType: InstanceType;
    tasks: Task[];
    jobs: Job[];
    gtJob: Job | null;
    gtJobMeta: FramesMetaData | null;
    validationLayout: TaskValidationLayout | null;
    issues: Issue[];
    settings: QualitySettings | null;
    parentSettings: QualitySettings | null;
    childrenSettings: QualitySettings[];
    history: QualityReport[];
}

export enum QualityControlActionTypes {
    INITIALIZE = 'QUALITY_CONTROL_INITIALIZE',
    INITIALIZE_SUCCESS = 'QUALITY_CONTROL_INITIALIZE_SUCCESS',
    INITIALIZE_FAILED = 'QUALITY_CONTROL_INITIALIZE_FAILED',
    RESET = 'QUALITY_CONTROL_RESET',
    REFRESH_REPORTS = 'QUALITY_CONTROL_REFRESH_REPORTS',
    REFRESH_REPORTS_SUCCESS = 'QUALITY_CONTROL_REFRESH_REPORTS_SUCCESS',
    REFRESH_REPORTS_FAILED = 'QUALITY_CONTROL_REFRESH_REPORTS_FAILED',
    SELECT_REPORT = 'QUALITY_CONTROL_SELECT_REPORT',
    LOAD_REPORT_DETAILS = 'QUALITY_CONTROL_LOAD_REPORT_DETAILS',
    LOAD_REPORT_DETAILS_SUCCESS = 'QUALITY_CONTROL_LOAD_REPORT_DETAILS_SUCCESS',
    LOAD_REPORT_DETAILS_FAILED = 'QUALITY_CONTROL_LOAD_REPORT_DETAILS_FAILED',
    LOAD_CONFLICTS = 'QUALITY_CONTROL_LOAD_CONFLICTS',
    LOAD_CONFLICTS_SUCCESS = 'QUALITY_CONTROL_LOAD_CONFLICTS_SUCCESS',
    LOAD_CONFLICTS_FAILED = 'QUALITY_CONTROL_LOAD_CONFLICTS_FAILED',
    CALCULATE = 'QUALITY_CONTROL_CALCULATE',
    CALCULATION_PROGRESS = 'QUALITY_CONTROL_CALCULATION_PROGRESS',
    CALCULATION_SUCCESS = 'QUALITY_CONTROL_CALCULATION_SUCCESS',
    CALCULATION_FAILED = 'QUALITY_CONTROL_CALCULATION_FAILED',
    SAVE_SETTINGS = 'QUALITY_CONTROL_SAVE_SETTINGS',
    SAVE_SETTINGS_SUCCESS = 'QUALITY_CONTROL_SAVE_SETTINGS_SUCCESS',
    SAVE_SETTINGS_FAILED = 'QUALITY_CONTROL_SAVE_SETTINGS_FAILED',
    DISMISS_SETTINGS_SAVED = 'QUALITY_CONTROL_DISMISS_SETTINGS_SAVED',
    UPDATE_VALIDATION = 'QUALITY_CONTROL_UPDATE_VALIDATION',
    UPDATE_VALIDATION_SUCCESS = 'QUALITY_CONTROL_UPDATE_VALIDATION_SUCCESS',
    UPDATE_VALIDATION_FAILED = 'QUALITY_CONTROL_UPDATE_VALIDATION_FAILED',
}

export const qualityControlActions = {
    initialize: (resourceKey: string) => createAction(
        QualityControlActionTypes.INITIALIZE, { resourceKey },
    ),
    initializeSuccess: (resourceKey: string, data: InitializationData) => createAction(
        QualityControlActionTypes.INITIALIZE_SUCCESS, { resourceKey, data },
    ),
    initializeFailed: (resourceKey: string, error: Error) => createAction(
        QualityControlActionTypes.INITIALIZE_FAILED, { resourceKey, error },
    ),
    reset: (resourceKey: string) => createAction(QualityControlActionTypes.RESET, { resourceKey }),
    refreshReports: (resourceKey: string) => createAction(
        QualityControlActionTypes.REFRESH_REPORTS, { resourceKey },
    ),
    refreshReportsSuccess: (resourceKey: string, history: QualityReport[]) => createAction(
        QualityControlActionTypes.REFRESH_REPORTS_SUCCESS, { resourceKey, history },
    ),
    refreshReportsFailed: (resourceKey: string, error: Error) => createAction(
        QualityControlActionTypes.REFRESH_REPORTS_FAILED, { resourceKey, error },
    ),
    selectReport: (resourceKey: string, reportID: number | null) => createAction(
        QualityControlActionTypes.SELECT_REPORT, { resourceKey, reportID },
    ),
    loadReportDetails: (resourceKey: string, reportID: number) => createAction(
        QualityControlActionTypes.LOAD_REPORT_DETAILS, { resourceKey, reportID },
    ),
    loadReportDetailsSuccess: (
        resourceKey: string,
        reportID: number,
        children: QualityReport[],
        jobReports: QualityReport[],
    ) => createAction(
        QualityControlActionTypes.LOAD_REPORT_DETAILS_SUCCESS,
        {
            resourceKey, reportID, children, jobReports,
        },
    ),
    loadReportDetailsFailed: (resourceKey: string, reportID: number, error: Error) => createAction(
        QualityControlActionTypes.LOAD_REPORT_DETAILS_FAILED, { resourceKey, reportID, error },
    ),
    loadConflicts: (resourceKey: string, reportID: number) => createAction(
        QualityControlActionTypes.LOAD_CONFLICTS, { resourceKey, reportID },
    ),
    loadConflictsSuccess: (
        resourceKey: string,
        reportID: number,
        conflicts: QualityConflict[],
    ) => createAction(
        QualityControlActionTypes.LOAD_CONFLICTS_SUCCESS, { resourceKey, reportID, conflicts },
    ),
    loadConflictsFailed: (resourceKey: string, reportID: number, error: Error) => createAction(
        QualityControlActionTypes.LOAD_CONFLICTS_FAILED, { resourceKey, reportID, error },
    ),
    calculate: (resourceKey: string) => createAction(QualityControlActionTypes.CALCULATE, { resourceKey }),
    calculationProgress: (resourceKey: string, request: Request) => createAction(
        QualityControlActionTypes.CALCULATION_PROGRESS, { resourceKey, request },
    ),
    calculationSuccess: (resourceKey: string, request: Request) => createAction(
        QualityControlActionTypes.CALCULATION_SUCCESS, { resourceKey, request },
    ),
    calculationFailed: (resourceKey: string, error: Error) => createAction(
        QualityControlActionTypes.CALCULATION_FAILED, { resourceKey, error },
    ),
    saveSettings: (resourceKey: string) => createAction(
        QualityControlActionTypes.SAVE_SETTINGS, { resourceKey },
    ),
    saveSettingsSuccess: (
        resourceKey: string,
        settings: QualitySettings | null,
        childrenSettings: QualitySettings[],
    ) => createAction(
        QualityControlActionTypes.SAVE_SETTINGS_SUCCESS,
        { resourceKey, settings, childrenSettings },
    ),
    saveSettingsFailed: (resourceKey: string, error: Error) => createAction(
        QualityControlActionTypes.SAVE_SETTINGS_FAILED, { resourceKey, error },
    ),
    dismissSettingsSaved: (resourceKey: string) => createAction(
        QualityControlActionTypes.DISMISS_SETTINGS_SAVED, { resourceKey },
    ),
    updateValidation: (resourceKey: string) => createAction(
        QualityControlActionTypes.UPDATE_VALIDATION, { resourceKey },
    ),
    updateValidationSuccess: (
        resourceKey: string,
        instance: Task,
        gtJob: Job,
        gtJobMeta: FramesMetaData,
        validationLayout: TaskValidationLayout | null,
    ) => createAction(
        QualityControlActionTypes.UPDATE_VALIDATION_SUCCESS,
        {
            resourceKey, instance, gtJob, gtJobMeta, validationLayout,
        },
    ),
    updateValidationFailed: (resourceKey: string, error: Error) => createAction(
        QualityControlActionTypes.UPDATE_VALIDATION_FAILED, { resourceKey, error },
    ),
};

export type QualityControlActions = ActionUnion<typeof qualityControlActions>;

function asError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
}

function makeResourceKey(type: InstanceType, id: number): string {
    return `${type}:${id}`;
}

async function receiveReportDetails(
    instanceType: InstanceType,
    reportID: number,
): Promise<{ children: QualityReport[]; jobReports: QualityReport[] }> {
    if (instanceType === InstanceType.TASK) {
        const children = Array.from(await core.analytics.quality.reports({
            parentID: reportID,
            target: 'job',
        }, true));
        return { children, jobReports: children };
    }

    const children = Array.from(await core.analytics.quality.reports({
        parentID: reportID,
        target: 'task',
    }, true));
    const nested = await Promise.all(children.map(async (child) => Array.from(
        await core.analytics.quality.reports({ parentID: child.id, target: 'job' }, true),
    )));
    return { children, jobReports: nested.flat() };
}

export function selectQualityReportAsync(resourceKey: string, reportID: number): ThunkAction {
    return async (dispatch, getState) => {
        dispatch(qualityControlActions.selectReport(resourceKey, reportID));
        const state = getState().qualityControl;
        const cached = state.reports.detailsByID[reportID];
        if (state.resourceKey !== resourceKey || (cached && !cached.error)) {
            return;
        }

        dispatch(qualityControlActions.loadReportDetails(resourceKey, reportID));
        try {
            const details = await receiveReportDetails(state.instanceType, reportID);
            dispatch(qualityControlActions.loadReportDetailsSuccess(
                resourceKey, reportID, details.children, details.jobReports,
            ));
        } catch (error: unknown) {
            dispatch(qualityControlActions.loadReportDetailsFailed(resourceKey, reportID, asError(error)));
        }
    };
}

export function refreshQualityReportsAsync(
    resourceKey: string,
    preferredReportID?: number,
): ThunkAction {
    return async (dispatch, getState) => {
        const state = getState().qualityControl;
        if (state.resourceKey !== resourceKey || !state.instance || !state.instanceType) {
            return;
        }

        dispatch(qualityControlActions.refreshReports(resourceKey));
        try {
            const filter = state.instanceType === InstanceType.TASK ? {
                taskID: state.instance.id,
                target: 'task',
                pageSize: 5,
            } : {
                projectID: state.instance.id,
                target: 'project',
                pageSize: 5,
            };
            const history = Array.from(await core.analytics.quality.reports(filter));
            dispatch(qualityControlActions.refreshReportsSuccess(resourceKey, history));

            const report = history.find(({ id }) => id === preferredReportID) || history[0];
            if (report) {
                await dispatch(selectQualityReportAsync(resourceKey, report.id));
            }
        } catch (error: unknown) {
            dispatch(qualityControlActions.refreshReportsFailed(resourceKey, asError(error)));
        }
    };
}

async function listenToCalculation(
    resourceKey: string,
    requestID: string,
    dispatch: Parameters<ThunkAction>[0],
    initialRequest?: Request,
): Promise<void> {
    try {
        const request = await core.requests.listen(requestID, {
            initialRequest,
            callback: (updatedRequest) => {
                dispatch(qualityControlActions.calculationProgress(resourceKey, updatedRequest));
                updateRequestProgress(updatedRequest, dispatch);
            },
        });
        dispatch(qualityControlActions.calculationSuccess(resourceKey, request));
        updateRequestProgress(request, dispatch);
        await dispatch(refreshQualityReportsAsync(resourceKey, request.resultID));
    } catch (error: unknown) {
        dispatch(qualityControlActions.calculationFailed(resourceKey, asError(error)));
    }
}

export function recoverQualityCalculationAsync(
    type: InstanceType,
    id: number,
    resourceKey = makeResourceKey(type, id),
): ThunkAction {
    return async (dispatch, getState) => {
        const resource = type === InstanceType.TASK ? { taskID: id } : { projectID: id };
        try {
            const [queued, started, failed] = await Promise.all([
                core.requests.list({
                    action: 'calculate', subresource: 'quality', status: RQStatus.QUEUED, ...resource,
                }),
                core.requests.list({
                    action: 'calculate', subresource: 'quality', status: RQStatus.STARTED, ...resource,
                }),
                core.requests.list({
                    action: 'calculate', subresource: 'quality', status: RQStatus.FAILED, ...resource,
                }),
            ]);
            const [request] = [...queued, ...started].sort((left, right) => (
                Date.parse(right.createdDate) - Date.parse(left.createdDate)
            ));
            const state = getState().qualityControl;
            if (state.resourceKey !== resourceKey) return;

            if (request) {
                dispatch(qualityControlActions.calculationProgress(resourceKey, request));
                updateRequestProgress(request, dispatch);
                await listenToCalculation(resourceKey, request.id, dispatch, request);
                return;
            }

            const [failedRequest] = Array.from(failed).sort((left, right) => (
                Date.parse(right.finishedDate || right.createdDate) -
                Date.parse(left.finishedDate || left.createdDate)
            ));
            const latestReport = state.reports.history[0];
            if (
                failedRequest &&
                (!latestReport || Date.parse(failedRequest.finishedDate || failedRequest.createdDate) >
                    Date.parse(latestReport.createdDate))
            ) {
                dispatch(qualityControlActions.calculationProgress(resourceKey, failedRequest));
                updateRequestProgress(failedRequest, dispatch);
                dispatch(qualityControlActions.calculationFailed(
                    resourceKey,
                    new Error(failedRequest.message),
                ));
            }
        } catch {
            // Recovery is best effort. A request-listing failure must not be shown as a failed calculation.
        }
    };
}

export function initializeQualityControlAsync(type: InstanceType, id: number): ThunkAction {
    return async (dispatch) => {
        const resourceKey = makeResourceKey(type, id);
        dispatch(qualityControlActions.initialize(resourceKey));

        try {
            const instancePromise = type === InstanceType.PROJECT ?
                core.projects.get({ id }).then(([instance]) => instance) :
                core.tasks.get({ id }).then(([instance]) => instance);
            const settingsPromise = type === InstanceType.PROJECT ?
                core.analytics.quality.settings.get({ projectID: id, parentType: 'project' }) :
                core.analytics.quality.settings.get({ taskID: id });
            const reportsPromise = core.analytics.quality.reports(type === InstanceType.PROJECT ? {
                projectID: id, target: 'project', pageSize: 5,
            } : {
                taskID: id, target: 'task', pageSize: 5,
            });
            const tasksPromise = type === InstanceType.PROJECT ?
                core.tasks.get({ projectId: id }, true) : Promise.resolve([] as Task[]);
            const projectJobsPromise = type === InstanceType.PROJECT ?
                core.jobs.get({ projectID: id }, true) : Promise.resolve([] as Job[]);
            const childrenSettingsPromise = type === InstanceType.PROJECT ?
                core.analytics.quality.settings.get({ projectID: id, parentType: 'task' }, true) :
                Promise.resolve([] as QualitySettings[]);

            const [
                instance,
                settingsList,
                historyList,
                projectTasks,
                projectJobs,
                childrenSettings,
            ] = await Promise.all([
                instancePromise,
                settingsPromise,
                reportsPromise,
                tasksPromise,
                projectJobsPromise,
                childrenSettingsPromise,
            ]);

            if (!instance) {
                throw new Error(`The ${type} was not found`);
            }

            let jobs: Job[] = Array.from(projectJobs);
            let gtJob: Job | null = null;
            let gtJobMeta: FramesMetaData | null = null;
            let validationLayout: TaskValidationLayout | null = null;
            let issues: Issue[] = [];
            let parentSettings: QualitySettings | null = null;

            if (instance instanceof Task) {
                jobs = instance.jobs;
                gtJob = jobs.find((job) => job.type === JobType.GROUND_TRUTH) || null;
                const parentSettingsPromise = instance.projectId === null ?
                    Promise.resolve([] as QualitySettings[]) :
                    core.analytics.quality.settings.get({
                        projectID: instance.projectId,
                        parentType: 'project',
                    });
                const [receivedIssues, receivedLayout, receivedMeta, parentSettingsList] = await Promise.all([
                    instance.issues(),
                    gtJob ? instance.validationLayout() : Promise.resolve(null),
                    gtJob ? core.frames.getMeta('job', gtJob.id) : Promise.resolve(null),
                    parentSettingsPromise,
                ]);
                issues = receivedIssues;
                validationLayout = receivedLayout;
                gtJobMeta = receivedMeta;
                parentSettings = parentSettingsList[0] || null;
            }

            const history = Array.from(historyList);
            dispatch(qualityControlActions.initializeSuccess(resourceKey, {
                instance,
                instanceType: type,
                tasks: Array.from(projectTasks),
                jobs,
                gtJob,
                gtJobMeta,
                validationLayout,
                issues,
                settings: settingsList[0] || null,
                parentSettings,
                childrenSettings: Array.from(childrenSettings),
                history,
            }));

            if (history[0]) {
                await dispatch(selectQualityReportAsync(resourceKey, history[0].id));
            }
            dispatch(recoverQualityCalculationAsync(type, id, resourceKey));
        } catch (error: unknown) {
            dispatch(qualityControlActions.initializeFailed(resourceKey, asError(error)));
        }
    };
}

export function calculateQualityReportAsync(resourceKey: string): ThunkAction {
    return async (dispatch, getState) => {
        const state = getState().qualityControl;
        if (state.resourceKey !== resourceKey || !state.instance || !state.instanceType) {
            return;
        }
        if (
            state.calculation.submitting ||
            (state.calculation.request && [RQStatus.QUEUED, RQStatus.STARTED].includes(
                state.calculation.request.status,
            ))
        ) {
            return;
        }

        dispatch(qualityControlActions.calculate(resourceKey));
        try {
            const requestID = await core.analytics.quality.createReport(
                state.instanceType === InstanceType.TASK ?
                    { taskID: state.instance.id } : { projectID: state.instance.id },
            );
            await listenToCalculation(resourceKey, requestID, dispatch);
        } catch (error: unknown) {
            dispatch(qualityControlActions.calculationFailed(resourceKey, asError(error)));
        }
    };
}

export function loadQualityConflictsAsync(resourceKey: string, reportID: number): ThunkAction {
    return async (dispatch, getState) => {
        const cached = getState().qualityControl.reports.conflictsByReportID[reportID];
        if (cached && !cached.error) {
            return;
        }

        dispatch(qualityControlActions.loadConflicts(resourceKey, reportID));
        try {
            const conflicts = await core.analytics.quality.conflicts({ reportID }, false);
            dispatch(qualityControlActions.loadConflictsSuccess(resourceKey, reportID, conflicts));
        } catch (error: unknown) {
            dispatch(qualityControlActions.loadConflictsFailed(resourceKey, reportID, asError(error)));
        }
    };
}

export function saveQualitySettingsAsync(
    resourceKey: string,
    updates: UpdateQualitySettingsData,
): ThunkAction {
    return async (dispatch, getState) => {
        const state = getState().qualityControl;
        if (state.resourceKey !== resourceKey) {
            return;
        }

        dispatch(qualityControlActions.saveSettings(resourceKey));
        try {
            const updated = await Promise.all(Object.values(updates).map(
                ({ settings, fields }) => settings.save(fields),
            ));
            const updatedByID = Object.fromEntries(updated.map((settings) => [settings.id, settings]));
            const current = state.settings.current ?
                updatedByID[state.settings.current.id] || state.settings.current : null;
            const children = state.settings.children.map(
                (settings) => updatedByID[settings.id] || settings,
            );
            dispatch(qualityControlActions.saveSettingsSuccess(resourceKey, current, children));
        } catch (error: unknown) {
            dispatch(qualityControlActions.saveSettingsFailed(resourceKey, asError(error)));
        }
    };
}

export function updateQualityValidationAsync(
    resourceKey: string,
    operation: 'delete' | 'restore',
    frameIDs: number[],
): ThunkAction {
    return async (dispatch, getState) => {
        const state = getState().qualityControl;
        if (
            state.resourceKey !== resourceKey ||
            !(state.instance instanceof Task) ||
            !state.gtJob
        ) {
            return;
        }

        dispatch(qualityControlActions.updateValidation(resourceKey));
        try {
            frameIDs.forEach((frameID) => state.gtJob.frames[operation](frameID));
            const [gtJobMeta] = await state.gtJob.frames.save();
            const [instance] = await core.tasks.get({ id: state.instance.id });
            const gtJob = instance.jobs.find((job) => job.type === JobType.GROUND_TRUTH);
            if (!gtJob) {
                throw new Error('Ground Truth job is no longer available');
            }
            const validationLayout = await instance.validationLayout();
            dispatch(qualityControlActions.updateValidationSuccess(
                resourceKey, instance, gtJob, gtJobMeta, validationLayout,
            ));
        } catch (error: unknown) {
            dispatch(qualityControlActions.updateValidationFailed(resourceKey, asError(error)));
        }
    };
}
