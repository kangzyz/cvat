// Copyright (C) 2022 Intel Corporation
// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import { Config } from '@react-awesome-query-builder/antd';
import i18n from 'i18n';
import asyncFetchUsers from 'components/resource-sorting-filtering/request-users';

export const config: Partial<Config> = {
    fields: {
        state: {
            label: i18n.t('resources:fields.state'),
            type: 'select',
            operators: ['select_any_in', 'select_equals'],
            valueSources: ['value'],
            fieldSettings: {
                listValues: [
                    { value: 'new', title: i18n.t('resources:jobState.new') },
                    { value: 'in progress', title: i18n.t('resources:jobState.inProgress') },
                    { value: 'rejected', title: i18n.t('resources:jobState.rejected') },
                    { value: 'completed', title: i18n.t('resources:jobState.completed') },
                ],
            },
        },
        stage: {
            label: i18n.t('resources:fields.stage'),
            type: 'select',
            operators: ['select_any_in', 'select_equals'],
            valueSources: ['value'],
            fieldSettings: {
                listValues: [
                    { value: 'annotation', title: i18n.t('resources:jobStage.annotation') },
                    { value: 'validation', title: i18n.t('resources:jobStage.validation') },
                    { value: 'acceptance', title: i18n.t('resources:jobStage.acceptance') },
                ],
            },
        },
        dimension: {
            label: i18n.t('resources:fields.dimension'),
            type: 'select',
            operators: ['select_equals'],
            valueSources: ['value'],
            fieldSettings: {
                listValues: [
                    { value: '2d', title: i18n.t('resources:dimension.2d') },
                    { value: '3d', title: i18n.t('resources:dimension.3d') },
                ],
            },
        },
        assignee: {
            label: i18n.t('resources:fields.assignee'),
            type: 'select',
            valueSources: ['value'],
            operators: ['select_equals'],
            fieldSettings: {
                useAsyncSearch: true,
                forceAsyncSearch: true,
                asyncFetch: asyncFetchUsers,
            },
        },
        updated_date: {
            label: i18n.t('resources:fields.lastUpdated'),
            type: 'datetime',
            operators: ['between', 'greater', 'greater_or_equal', 'less', 'less_or_equal'],
        },
        id: {
            label: i18n.t('resources:fields.id'),
            type: 'number',
            operators: ['equal', 'between', 'greater', 'greater_or_equal', 'less', 'less_or_equal'],
            fieldSettings: { min: 0 },
            valueSources: ['value'],
        },
        task_id: {
            label: i18n.t('resources:fields.taskId'),
            type: 'number',
            operators: ['equal', 'between', 'greater', 'greater_or_equal', 'less', 'less_or_equal'],
            fieldSettings: { min: 0 },
            valueSources: ['value'],
        },
        project_id: {
            label: i18n.t('resources:fields.projectId'),
            type: 'number',
            operators: ['equal', 'between', 'greater', 'greater_or_equal', 'less', 'less_or_equal'],
            fieldSettings: { min: 0 },
            valueSources: ['value'],
        },
        task_name: {
            label: i18n.t('resources:fields.taskName'),
            type: 'text',
            valueSources: ['value'],
            operators: ['like'],
        },
        project_name: {
            label: i18n.t('resources:fields.projectName'),
            type: 'text',
            valueSources: ['value'],
            operators: ['like'],
        },
        type: {
            label: i18n.t('resources:fields.jobType'),
            type: 'select',
            operators: ['select_equals'],
            valueSources: ['value'],
            fieldSettings: {
                listValues: [
                    { value: 'annotation', title: i18n.t('resources:jobType.annotation') },
                    { value: 'ground_truth', title: i18n.t('resources:jobType.groundTruth') },
                    { value: 'consensus_replica', title: i18n.t('resources:jobType.consensusReplica') },
                ],
            },
        },
        parent_job_id: {
            label: i18n.t('resources:fields.parentId'),
            type: 'number',
            operators: ['is_empty', 'is_not_empty', 'equal', 'between', 'greater', 'greater_or_equal', 'less', 'less_or_equal'],
            fieldSettings: { min: 0 },
            valueSources: ['value'],
        },
    },
};

export const localStorageRecentCapacity = 10;
export const localStorageRecentKeyword = 'recentlyAppliedJobsFilters';
export const predefinedFilterValues = {
    [i18n.t('resources:filters.assignedToMe')]: '{"and":[{"==":[{"var":"assignee"},"<username>"]}]}',
    [i18n.t('resources:filters.notCompleted')]: '{"!":{"or":[{"==":[{"var":"state"},"completed"]},{"==":[{"var":"stage"},"acceptance"]}]}}',
};
