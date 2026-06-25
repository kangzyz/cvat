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
            operators: ['select_any_in', 'select_equals'], // ['select_equals', 'select_not_equals', 'select_any_in', 'select_not_any_in']
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
        updatedDate: {
            label: i18n.t('resources:fields.lastUpdated'),
            type: 'datetime',
            operators: ['between', 'greater', 'greater_or_equal', 'less', 'less_or_equal'],
        },
        type: {
            label: i18n.t('resources:fields.type'),
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
        id: {
            label: i18n.t('resources:fields.id'),
            type: 'number',
            operators: ['equal', 'between', 'greater', 'greater_or_equal', 'less', 'less_or_equal'],
            fieldSettings: { min: 0 },
            valueSources: ['value'],
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
    [i18n.t('resources:filters.notAReplica')]: '{"and":[{"!":{"var":"parent_job_id"}}]}',
};
